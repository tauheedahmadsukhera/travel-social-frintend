import { EventEmitter } from 'fbemitter';

const emitter = new EventEmitter();

export const MiniStreamBus = {
  onShow: (cb: () => void) => emitter.addListener('miniStream:show', cb),
  onHide: (cb: () => void) => emitter.addListener('miniStream:hide', cb),
  show: () => emitter.emit('miniStream:show'),
  hide: () => emitter.emit('miniStream:hide'),
};

export default MiniStreamBus;
