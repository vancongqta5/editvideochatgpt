const $ = id => document.getElementById(id);
const CHANNEL = 'dashboard-studio-v21';
const STUDIO_ORIGIN = new URL($('studio').src).origin;
const defaults = {fontSize:52,positionX:50,positionY:220,maxWidth:87,fontFamily:'Arial',fontWeight:700,
  color:'#ffffff',backgroundColor:'#000000',backgroundOpacity:.55,strokeWidth:0,strokeColor:'#000000',effect:'none'};
const fields = [
  ['fontSize','Cỡ chữ',16,160,1],['positionX','Vị trí ngang (%)',0,100,.1],
  ['positionY','Cách đáy (px)',0,1880,1],['maxWidth','Chiều rộng (%)',20,100,1],
  ['backgroundOpacity','Độ đậm nền',0,1,.05],['strokeWidth','Độ dày viền',0,8,.5]
];
let scenes=[], revision='', config=null, selectedId='', loaded=false, locked=true, editing=false;
let instance = null, lastReady = 0, pendingSeek = null, requestId = 0;
const pending=new Map(), rows=new Map();
let currentProjectId = null;
const find = id => scenes.find(s=>String(s.id)===String(id));
const styleOf = s => Object.fromEntries(Object.keys(defaults).map(k=>[k,s?.[k]??defaults[k]]));
function status(text,error=false){$('status').textContent=text;$('status').classList.toggle('error',error);}
function controls() {
  document.querySelectorAll(
    '#scenes textarea,#scenes button'
  ).forEach(el => {
    el.disabled = locked || !loaded;
  });

  $('reload').disabled = locked;
  $('refresh').disabled = locked;
  $('sourcesReload').disabled = locked;
  $('sourceSelect').disabled = locked;
  $('openSource').disabled =
    locked || !$('sourceSelect').value;

  const canEdit = loaded && Boolean(currentProjectId) && !locked;
  $('save').disabled = !canEdit || pending.size === 0;
  $('sync').disabled = !canEdit;
  $('render').disabled = !canEdit;
  $('inspector').disabled = !canEdit || !find(selectedId);
}
async function api(url,body){
  const response=await fetch(url,{cache:'no-store',...(body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})});
  const raw=await response.text();let data;
  try{data=JSON.parse(raw);}catch{throw new Error(`HTTP ${response.status}: phản hồi không phải JSON`);}
  if(!response.ok)throw new Error(data.error||`HTTP ${response.status}`);
  return data;
}
function send(data){$('studio').contentWindow?.postMessage({channel:CHANNEL,...data},STUDIO_ORIGIN);}
function preview(){if(loaded)send({type:'SNAPSHOT',scenes,selectedId,editing,locked});}
function fillInspector(){
  $('selected').textContent=selectedId;
  const style=styleOf(find(selectedId));
  for(const key of Object.keys(defaults)){
    $(key).value=style[key];
    if($(key+'Value'))$(key+'Value').textContent=style[key];
  }
  $('drag').textContent=editing?'Tắt kéo chữ / Xem hiệu ứng':'Bật kéo chữ trong Preview';
  controls();
}
function selectScene(id,seekToStart=true){
  if(locked||!find(id))return;
  selectedId=String(id);
  rows.forEach((row,key)=>row.card.classList.toggle('selected',key===selectedId));
  fillInspector();preview();
  if(seekToStart){
    pendingSeek={type:'SEEK',requestId:++requestId,seconds:find(id).start};
    send(pendingSeek);
  }
}
function queue(id, patch) {
  if (locked || !loaded || !currentProjectId) return;

  const scene = find(id);
  if (!scene) return;

  const clean = {};
  for (const [key, value] of Object.entries(patch)) {
    if (key === 'text' || Object.hasOwn(defaults, key)) {
      clean[key] = value;
    }
  }
  if (!Object.keys(clean).length) return;

  const sceneId = String(id);
  Object.assign(scene, clean);
  pending.set(sceneId, {...pending.get(sceneId), ...clean});

  const row = rows.get(sceneId);
  if (row && row.input.value !== scene.text) {
    row.input.value = scene.text;
  }

  preview();
  controls();
  status('Có thay đổi chưa lưu. Bấm Lưu phụ đề để giữ bản chỉnh.');
}

function report(error) {
  status(error.message, true);
}

async function flush() {
  if (!pending.size) return;

  status('Đang lưu phụ đề…');
  const result = await api('/api/save', {
    projectId: currentProjectId,
    revision,
    updates: [...pending].map(([id, patch]) => ({id, ...patch})),
  });

  revision = result.revision;
  pending.clear();
  status('Đã lưu phụ đề.');
}
function makeCards(){
  rows.clear();$('scenes').replaceChildren();
  for(const scene of scenes){
    const id=String(scene.id),card=document.createElement('article');
    const button=document.createElement('button'),input=document.createElement('textarea');
    button.className='scene-title';button.textContent=`${id} · ${scene.start.toFixed(2)} → ${scene.end.toFixed(2)}s`;
    input.value = scene.text;
    input.maxLength = 10000;
    input.setAttribute('aria-label', `Lời thoại ${id}`);
    card.onclick=()=>selectScene(id);
    button.onclick=e=>{e.stopPropagation();selectScene(id);};
    input.onclick=e=>{e.stopPropagation();if(selectedId!==id)selectScene(id);};
    input.onfocus=()=>{if(selectedId!==id)selectScene(id);};
    input.oninput=()=>queue(id,{text:input.value});
    card.append(button,input);$('scenes').append(card);rows.set(id,{card,input});
    card.classList.toggle('selected',id===selectedId);
  }
  $('count').textContent=`${scenes.length} cảnh`;
}
function setDownload(url) {
  const link = $('download');

  if (url) {
    link.href = url;
  } else {
    link.removeAttribute('href');
  }

  link.hidden = !url;
}

async function load() {
  const data = await api('/api/state');
  currentProjectId = data.project?.id ?? null;
  scenes = data.scenes;
  revision = data.revision;
  config = data.config;
  loaded = true;
  editing = false;
  selectedId = String(scenes[0]?.id ?? '');

  pending.clear();
  pendingSeek = null;

  setDownload(data.downloadUrl);
  $('positionY').max = config.height - 40;
  $('projectLabel').textContent = data.project
    ? `Đang mở: ${data.project.sourceFile}`
    : 'Chưa chọn dự án';

  makeCards();
  fillInspector();
  preview();
  return data;
}
async function waitJob(id) {
  const panel = $('logs');
  const log = $('log');
  panel.hidden = false;
  panel.open = true;

  for (;;) {
    const {job} = await api('/api/job');

    if (!job || job.id !== id) {
      throw new Error('Không tìm thấy tác vụ. Hãy tải lại cảnh để kiểm tra.');
    }

    log.textContent = (job.log || '')
      .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')
      .replace(/\r\n?/g, '\n');

    if (job.status === 'error') {
      throw new Error(job.error || 'Tác vụ thất bại. Xem log để biết chi tiết.');
    }

    if (job.status === 'done') {
      if (job.kind === 'render' && job.projectId === currentProjectId) {
        setDownload(job.downloadUrl);
      }
      return job;
    }

    const label = job.kind === 'render'
      ? 'Đang xuất MP4'
      : job.kind === 'transcribe'
        ? 'Đang bóc băng Whisper'
        : 'Đang đồng bộ Python';

    const seconds = Math.floor((Date.now() - job.startedAt) / 1000);
    status(`${label}… ${seconds}s`);

    await new Promise(resolve => setTimeout(resolve, 800));
  }
}
async function run(task){
  if(locked)return;
  locked=true;controls();send({type:'PAUSE'});preview();
  try{await task();}catch(error){report(error);}
  finally{locked=false;controls();preview();}
}
for(const [key,label,min,max,step] of fields){
  const wrap=document.createElement('label');wrap.className='control';
  wrap.innerHTML=`<span>${label}<output id="${key}Value"></output></span><input id="${key}" type="range" min="${min}" max="${max}" step="${step}">`;
  $('ranges').append(wrap);
}
for(const key of Object.keys(defaults))$(key).oninput=()=>{
  const value=typeof defaults[key]==='number'?Number($(key).value):$(key).value;
  if($(key+'Value'))$(key+'Value').textContent=value;
  queue(selectedId,{[key]:value});
};
async function loadSources() {
  const {files} = await api('/api/sources');
  const previous = $('sourceSelect').value;
  $('sourceSelect').replaceChildren();

  for (const file of files) {
    const option = document.createElement('option');
    option.value = file.name;
    option.textContent = file.name;
    $('sourceSelect').append(option);
  }

  if (files.some(file => file.name === previous)) {
    $('sourceSelect').value = previous;
  }
}

function reloadStudio() {
  instance = null;
  lastReady = 0;
  pendingSeek = null;
  $('connection').textContent = 'Đang tải dự án vào Studio…';

  const url = new URL('http://localhost:3000/MyComposition');
  url.searchParams.set('reload', String(Date.now()));
  $('studio').src = url.href;
}

$('sourceSelect').onchange = controls;

$('sourcesReload').onclick = () => run(async () => {
  await loadSources();
  status('Đã đọc danh sách video trong data/source.');
});

$('openSource').onclick = () => {
  const file = $('sourceSelect').value;
  if (!file) return;

  if (pending.size &&
      !confirm('Bỏ thay đổi chưa lưu để mở video mới?')) return;

  run(async () => {

    status('Đang tạo và mở dự án…');
    const created = await api('/api/projects', {file});
    await api('/api/active-project', {id: created.id});

    await load();
    reloadStudio();
    status(`Đã mở ${file} · Chế độ xem trước.`);
  });
};
$('save').onclick = () => run(flush);

$('reload').onclick = () => {
  if (pending.size && !confirm(
    'Tải lại sẽ bỏ thay đổi chưa lưu. Hãy sao chép lời thoại cần giữ trước.'
  )) return;

  run(async () => {
    const data = await load();
    if (data.job?.status === 'running') {
      await waitJob(data.job.id);
      await load();
    }

    reloadStudio();
    status('Đã tải dữ liệu mới nhất.');
  });
};
$('render').onclick = () => run(async () => {
  if (!loaded || !currentProjectId) return;

  status('Đang lưu phụ đề và bắt đầu xuất MP4…');

  const data = await api('/api/render', {
    projectId: currentProjectId,
    revision,
    updates: [...pending].map(([id, patch]) => ({id, ...patch})),
  });

  revision = data.revision;
  pending.clear();
  editing = false;
  fillInspector();
  preview();

  $('log').textContent = '';
  await waitJob(data.job.id);
  status('Xuất MP4 hoàn tất. Bấm Tải MP4 để tải video.');
});
$('sync').onclick = () => {
  if (locked || !currentProjectId) return;

  const warning = pending.size
    ? ' Các chỉnh sửa chưa lưu trên Dashboard sẽ bị bỏ nếu bóc băng thành công.'
    : '';

  if (!confirm(
    'Bóc băng video đang mở? Phụ đề đã lưu sẽ được sao lưu rồi tạo lại.' + warning
  )) return;

  const projectId = currentProjectId;
  const requestedRevision = revision;

  run(async () => {
    $('logs').hidden = false;
    $('log').textContent = '';
    status('Đang khởi động Whisper…');

    const data = await api('/api/transcribe', {
      projectId,
      revision: requestedRevision,
    });

    await waitJob(data.job.id);
    await load();
    reloadStudio();

    status(`Bóc băng hoàn tất · ${scenes.length} cảnh.`);
  });
};
$('reset').onclick=()=>{queue(selectedId,defaults);fillInspector();};
$('apply').onclick=()=>{
  if(!confirm('Áp dụng định dạng cảnh đang chọn cho tất cả cảnh?'))return;
  const style=styleOf(find(selectedId));for(const scene of scenes)queue(scene.id,style);
};
$('drag').onclick=()=>{editing=!editing;send({type:'PAUSE'});fillInspector();preview();};
$('refresh').onclick = reloadStudio;
$('studio').onload=()=>{instance=null;send({type:'HELLO'});};
window.addEventListener('message',event=>{
  if(event.origin!==STUDIO_ORIGIN||event.source!==$('studio').contentWindow||event.data?.channel!==CHANNEL)return;
  const data=event.data;
  if(data.type==='READY'){
    lastReady=Date.now();$('connection').textContent=`Đã nối · ${data.fps} fps`;
    if(instance!==data.instance){instance=data.instance;preview();}
    if(pendingSeek)send(pendingSeek);
  }
  if(data.type==='SEEKED'&&pendingSeek?.requestId===data.requestId){
    pendingSeek=null;
    if(data.clamped)status('Cảnh vượt thời lượng Composition. Kiểm tra video-config.json.',true);
  }
  if(data.type==='FRAME'&&Number.isFinite(data.frame)&&config){
    rows.forEach((row,id)=>{const s=find(id);row.card.classList.toggle('active',data.frame>=Math.round(s.start*config.fps)&&data.frame<Math.round(s.end*config.fps));});
  }
  if(data.type==='SELECT'&&!locked)selectScene(data.id,false);
  if(data.type==='PATCH'&&!locked&&editing&&data.patch&&typeof data.patch==='object'){
    queue(data.id,data.patch);if(String(data.id)===selectedId)fillInspector();
  }
});
setInterval(()=>{
  send({type:'HELLO'});
  if(Date.now()-lastReady>5000)$('connection').textContent='Chưa nối · Kiểm tra Studio cổng 3000';
},1500);
window.addEventListener('beforeunload',event=>{
    if (pending.size || locked) {
    event.preventDefault();
    event.returnValue = '';
  }
});
controls();

(async () => {
  try {
    await loadSources();
    const data = await load();

    if (data.job?.status === 'running') {
      await waitJob(data.job.id);
      await load();
    }

    reloadStudio();
    status(currentProjectId
      ? 'Đã mở dự án gần nhất · Chế độ xem trước.'
      : 'Chọn video từ data/source rồi bấm Tạo & mở dự án.');
  } catch (error) {
    report(error);
  } finally {
    locked = false;
    controls();
    preview();
    send({type: 'HELLO'});
  }
})();
