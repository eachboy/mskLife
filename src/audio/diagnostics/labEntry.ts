// Точка входа audio-lab.html: только звук, без сцен и UI.
import { renderOffline } from './audioLab'

;(window as unknown as { __audioLab: unknown }).__audioLab = { renderOffline }
document.body.dataset.ready = '1'
