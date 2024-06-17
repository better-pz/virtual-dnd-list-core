import Dnd from 'sortable-dnd';
import { debounce, throttle } from './utils';

const VirtualAttrs = [
  'size',
  'keeps',
  'scroller',
  'direction',
  'debounceTime',
  'throttleTime',
];

const CACLTYPE = {
  INIT: 'INIT',
  FIXED: 'FIXED',
  DYNAMIC: 'DYNAMIC',
};

const DIRECTION = {
  FRONT: 'FRONT',
  BEHIND: 'BEHIND',
  STATIONARY: 'STATIONARY',
};

const rectDir = {
  vertical: 'top',
  horizontal: 'left',
};

const scrollDir = {
  vertical: 'scrollTop',
  horizontal: 'scrollLeft',
};

const scrollSize = {
  vertical: 'scrollHeight',
  horizontal: 'scrollWidth',
};

const offsetSize = {
  vertical: 'offsetHeight',
  horizontal: 'offsetWidth',
};

function Virtual(options) {
  this.options = options;

  const defaults = {
    size: 0,
    keeps: 0,
    buffer: 0,
    wrapper: null,
    scroller: null,
    direction: 'vertical',
    uniqueKeys: [],
    debounceTime: null,
    throttleTime: null,
  };

  for (const name in defaults) {
    !(name in this.options) && (this.options[name] = defaults[name]);
  }

  this.sizes = new Map(); // store item size
  this.range = { start: 0, end: 0, front: 0, behind: 0 };
  this.offset = 0;
  this.calcType = CACLTYPE.INIT;
  this.calcSize = { average: 0, fixed: 0 };
  this.scrollDirection = '';

  this.updateScrollElement();
  this.updateOnScrollFunction();
  this.addScrollEventListener();
  this.checkIfUpdate(0, options.keeps - 1);
}

Virtual.prototype = {
  constructor: Virtual,

  isFront() {
    return this.scrollDirection === DIRECTION.FRONT;
  },

  isBehind() {
    return this.scrollDirection === DIRECTION.BEHIND;
  },

  isFixed() {
    return this.calcType === CACLTYPE.FIXED;
  },

  getSize(key) {
    return this.sizes.get(key) || this.getItemSize();
  },

  getOffset() {
    return this.scrollEl[scrollDir[this.options.direction]];
  },

  getScrollSize() {
    return this.scrollEl[scrollSize[this.options.direction]];
  },

  getClientSize() {
    return this.scrollEl[offsetSize[this.options.direction]];
  },

  scrollToOffset(offset) {
    this.scrollEl[scrollDir[this.options.direction]] = offset;
  },

  scrollToIndex(index) {
    if (index >= this.options.uniqueKeys.length - 1) {
      this.scrollToBottom();
    } else {
      const indexOffset = this.getOffsetByIndex(index);
      const startOffset = this.getScrollStartOffset();
      this.scrollToOffset(indexOffset + startOffset);
    }
  },

  scrollToBottom() {
    const offset = this.getScrollSize();
    this.scrollToOffset(offset);

    // if the bottom is not reached, execute the scroll method again
    setTimeout(() => {
      const clientSize = this.getClientSize();
      const scrollSize = this.getScrollSize();
      const scrollOffset = this.getOffset();
      if (scrollOffset + clientSize + 1 < scrollSize) {
        this.scrollToBottom();
      }
    }, 5);
  },

  option(key, value) {
    const oldValue = this.options[key];

    this.options[key] = value;

    if (key === 'uniqueKeys') {
      this.sizes.forEach((v, k) => {
        if (!value.includes(k)) {
          this.sizes.delete(k);
        }
      });
    }
    if (key === 'scroller') {
      oldValue && Dnd.utils.off(oldValue, 'scroll', this.onScroll);
      this.updateScrollElement();
      this.addScrollEventListener();
    }
  },

  updateRange(range) {
    if (range) {
      this.handleUpdate(range.start, range.end);
      return;
    }

    let start = this.range.start;
    start = Math.max(start, 0);

    this.handleUpdate(start, this.getEndByStart(start));
  },

  onItemResized(key, size) {
    if (this.sizes.get(key) === size) {
      return;
    }

    this.sizes.set(key, size);

    if (this.calcType === CACLTYPE.INIT) {
      this.calcType = CACLTYPE.FIXED;
      this.calcSize.fixed = size;
    } else if (this.isFixed() && this.calcSize.fixed !== size) {
      this.calcType = CACLTYPE.DYNAMIC;
      this.calcSize.fixed = 0;
    }

    // calculate the average size only once
    if (this.calcType !== CACLTYPE.FIXED && !this.calcSize.average) {
      const critical = Math.min(this.options.keeps, this.options.uniqueKeys.length);
      if (this.sizes.size === critical) {
        const total = [...this.sizes.values()].reduce((t, i) => t + i, 0);
        this.calcSize.average = Math.round(total / this.sizes.size);
      }
    }
  },

  addScrollEventListener() {
    if (this.options.scroller) {
      Dnd.utils.on(this.options.scroller, 'scroll', this.onScroll);
    }
  },

  removeScrollEventListener() {
    if (this.options.scroller) {
      Dnd.utils.off(this.options.scroller, 'scroll', this.onScroll);
    }
  },

  enableScroll(enable) {
    const { scroller } = this.options;
    const event = enable ? Dnd.utils.off : Dnd.utils.on;
    const wheelEvent = 'onwheel' in document.createElement('div') ? 'wheel' : 'mousewheel';
    event(scroller, 'DOMMouseScroll', this.preventDefault);
    event(scroller, wheelEvent, this.preventDefault);
    event(scroller, 'touchmove', this.preventDefault);
    event(scroller, 'keydown', this.preventDefaultForKeyDown);
  },

  // ========================================= Properties =========================================
  preventDefault(e) {
    e.preventDefault();
  },

  preventDefaultForKeyDown(e) {
    const keys = { 37: 1, 38: 1, 39: 1, 40: 1 };
    if (keys[e.keyCode]) {
      this.preventDefault(e);
      return false;
    }
  },

  updateScrollElement() {
    const scroller = this.options.scroller;
    if ((scroller instanceof Document && scroller.nodeType === 9) || scroller instanceof Window) {
      this.scrollEl = document.scrollingElement || document.documentElement || document.body;
    } else {
      this.scrollEl = scroller;
    }
  },

  updateOnScrollFunction() {
    const { debounceTime, throttleTime } = this.options;
    if (debounceTime) {
      this.onScroll = debounce(() => this.handleScroll(), debounceTime);
    } else if (throttleTime) {
      this.onScroll = throttle(() => this.handleScroll(), throttleTime);
    } else {
      this.onScroll = () => this.handleScroll();
    }
  },

  handleScroll() {
    const offset = this.getOffset();
    const clientSize = this.getClientSize();
    const scrollSize = this.getScrollSize();

    if (offset === this.offset) {
      this.scrollDirection = DIRECTION.STATIONARY;
    } else {
      this.scrollDirection = offset < this.offset ? DIRECTION.FRONT : DIRECTION.BEHIND;
    }

    this.offset = offset;

    const top = this.isFront() && offset <= 0;
    const bottom = this.isBehind() && clientSize + offset >= scrollSize;

    this.options.onScroll({ top, bottom, offset, direction: this.scrollDirection });

    if (this.isFront()) {
      this.handleScrollFront();
    } else if (this.isBehind()) {
      this.handleScrollBehind();
    }
  },

  handleScrollFront() {
    const scrolls = this.getScrollItems();
    if (scrolls > this.range.start) {
      return;
    }
    const start = Math.max(scrolls - this.options.buffer, 0);
    this.checkIfUpdate(start, this.getEndByStart(start));
  },

  handleScrollBehind() {
    const scrolls = this.getScrollItems();

    if (scrolls < this.range.start + this.options.buffer) {
      return;
    }
    this.checkIfUpdate(scrolls, this.getEndByStart(scrolls));
  },

  getScrollItems() {
    const offset = this.offset - this.getScrollStartOffset();

    if (offset <= 0) {
      return 0;
    }

    if (this.isFixed()) {
      return Math.floor(offset / this.calcSize.fixed);
    }

    let low = 0;
    let high = this.options.uniqueKeys.length;
    let middle = 0;
    let middleOffset = 0;

    while (low <= high) {
      middle = low + Math.floor((high - low) / 2);
      middleOffset = this.getOffsetByIndex(middle);

      if (middleOffset === offset) {
        return middle;
      } else if (middleOffset < offset) {
        low = middle + 1;
      } else if (middleOffset > offset) {
        high = middle - 1;
      }
    }
    return low > 0 ? --low : 0;
  },

  checkIfUpdate(start, end) {
    const keeps = this.options.keeps;
    const total = this.options.uniqueKeys.length;

    if (total <= keeps) {
      start = 0;
      end = this.getLastIndex();
    } else if (end - start < keeps - 1) {
      start = end - keeps + 1;
    }

    if (this.range.start !== start) {
      this.handleUpdate(start, end);
    }
  },

  handleUpdate(start, end) {
    this.range.start = start;
    this.range.end = end;
    this.range.front = this.getFrontOffset();
    this.range.behind = this.getBehindOffset();

    this.options.onUpdate({ ...this.range });
  },

  getFrontOffset() {
    if (this.isFixed()) {
      return this.calcSize.fixed * this.range.start;
    } else {
      return this.getOffsetByIndex(this.range.start);
    }
  },

  getBehindOffset() {
    const end = this.range.end;
    const last = this.getLastIndex();

    if (this.isFixed()) {
      return (last - end) * this.calcSize.fixed;
    }

    return (last - end) * this.getItemSize();
  },

  getOffsetByIndex(index) {
    if (!index) return 0;

    let offset = 0;
    for (let i = 0; i < index; i++) {
      const size = this.sizes.get(this.options.uniqueKeys[i]);
      offset = offset + (typeof size === 'number' ? size : this.getItemSize());
    }

    return offset;
  },

  getEndByStart(start) {
    return Math.min(start + this.options.keeps - 1, this.getLastIndex());
  },

  getLastIndex() {
    const { uniqueKeys, keeps } = this.options;
    return uniqueKeys.length > 0 ? uniqueKeys.length - 1 : keeps - 1;
  },

  getItemSize() {
    return this.isFixed() ? this.calcSize.fixed : this.options.size || this.calcSize.average;
  },

  getScrollStartOffset() {
    let offset = 0;

    const { wrapper, scroller, direction } = this.options;

    if (scroller === wrapper) {
      return 0;
    }

    if (scroller && wrapper) {
      const rect =
        scroller instanceof Window
          ? Dnd.utils.getRect(wrapper)
          : Dnd.utils.getRect(wrapper, true, scroller);
      offset = this.offset + rect[rectDir[direction]];
    }

    return offset;
  },
};

export { Virtual, VirtualAttrs };
