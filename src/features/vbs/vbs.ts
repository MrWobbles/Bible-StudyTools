import {
  runMatrixEffect,
  separateCircles,
  toggleBirds,
  toggleCircles,
  toggleSparkles,
} from './effects';
import { hideText, playSfx, playVideo, showText, stopAll } from './player';

interface VbsEventMessage {
  type: string;
  payload?: {
    url?: string;
    loop?: boolean;
    text?: string;
  };
}

function connectSSE(): void {
  const source = new EventSource('/api/vbs/events');

  source.onmessage = (event: MessageEvent<string>) => {
    try {
      const data = JSON.parse(event.data) as VbsEventMessage;
      const payload = data.payload ?? {};

      if (data.type === 'play_video' && payload.url) {
        playVideo(payload.url);
      } else if (data.type === 'play_sfx' && payload.url) {
        playSfx(payload.url, Boolean(payload.loop));
      } else if (data.type === 'stop_all') {
        stopAll();
      } else if (data.type === 'show_text' && payload.text !== undefined) {
        showText(payload.text);
      } else if (data.type === 'hide_text') {
        hideText();
      } else if (data.type === 'toggle_bubbles') {
        toggleCircles();
      } else if (data.type === 'separate_bubbles') {
        separateCircles();
      } else if (data.type === 'matrix_effect') {
        runMatrixEffect(showText);
      } else if (data.type === 'toggle_sparkles') {
        toggleSparkles();
      } else if (data.type === 'toggle_birds') {
        toggleBirds();
      }
    } catch (err) {
      console.error('Error parsing SSE message:', err);
    }
  };

  source.onerror = (error) => {
    console.error('SSE Error:', error);
    source.close();
    setTimeout(connectSSE, 3000);
  };
}

connectSSE();
