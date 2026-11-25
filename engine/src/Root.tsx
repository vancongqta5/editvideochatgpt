/// <reference lib="dom" />

import {Composition} from 'remotion';
import type {CalculateMetadataFunction} from 'remotion';
import {MyComposition} from './Composition';
import type {VideoProps} from './Composition';
import type {Scene} from './editor-model';

const API = 'http://127.0.0.1:3001';

type StudioState = {
  project: {id: string; sourceFile: string} | null;
  scenes: Scene[];
  mediaPath: string | null;
  config: {
    width: number;
    height: number;
    fps: number;
    durationInFrames: number;
  };
};

type RenderProps = VideoProps & {
  renderConfig?: StudioState['config'];
};

const defaultProps: RenderProps = {scenes: [], videoSrc: ''};

const metadata: CalculateMetadataFunction<RenderProps> = async ({
  props,
  abortSignal,
  isRendering,
}) => {
  if (props.renderConfig) {
    const {width, height, fps, durationInFrames} = props.renderConfig;

    if (
      ![width, height, durationInFrames].every(
        (value) => Number.isInteger(value) && value > 0,
      ) ||
      !Number.isFinite(fps) ||
      fps <= 0
    ) {
      throw new Error('Cấu hình khung hình hoặc thời lượng xuất không hợp lệ.');
    }

    if (!Array.isArray(props.scenes) || !props.videoSrc?.trim()) {
      throw new Error('Thiếu nguồn video hoặc danh sách cảnh cho lần xuất.');
    }

    return {width, height, fps, durationInFrames, props};
  }

  if (isRendering) {
    throw new Error('Thiếu dữ liệu dự án để render. Hãy xuất MP4 từ Dashboard.');
  }
  const response = await fetch(`${API}/studio-state`, {
    cache: 'no-store',
    signal: abortSignal,
  });

  if (!response.ok) {
    throw new Error(`Không đọc được dự án: HTTP ${response.status}`);
  }

  const data = await response.json() as StudioState;

  return {
    width: data.config.width,
    height: data.config.height,
    fps: data.config.fps,
    durationInFrames: data.config.durationInFrames,
    props: {
      ...props,
      scenes: data.scenes,
      videoSrc: data.mediaPath
        ? new URL(data.mediaPath, API).href
        : '',
    },
  };
};

export const RemotionRoot = () => (
  <Composition
    id="MyComposition"
    component={MyComposition}
    width={1080}
    height={1920}
    fps={30}
    durationInFrames={1}
    defaultProps={defaultProps}
    calculateMetadata={metadata}
  />
);