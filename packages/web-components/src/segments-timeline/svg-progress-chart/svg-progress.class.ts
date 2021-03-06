import { IUISegment, IUISegmentEventData } from '../segments-timeline.definitions';
import { IChartData, IChartOptions, IComponentTree, Colors } from './svg-progress.definitions';
import { SeekBar, Rect, Tooltip } from './svg-progress.models';
import { Localization } from './../../../../common/services/localization/localization.class';

// Define the main class for the progress chart.
export class SVGProgressChart {
    public id: string;
    public rootElement: SVGElement;
    public components: IComponentTree;
    /* eslint-disable-next-line  @typescript-eslint/no-explicit-any */
    public timer: any;
    public lastMatch = false;
    public currentTooltipType: string = Localization.dictionary.SVG_PROGRESS_Default;
    public options: IChartOptions = {
        height: 500,
        width: 500,
        data: [],
        time: 0,
        tooltipHeight: 20,
        barHeight: 12,
        top: 0,
        renderBuffer: false,
        renderProgress: false,
        renderSeek: null
    };

    public activeRect: Rect;
    public activeSegment: IUISegment;
    public _activeSegmentCallback: (segment: IUISegmentEventData) => void;
    public _segmentStartCallback: (segment: IUISegmentEventData) => void;

    public constructor(element?: SVGElement, options?: IChartOptions) {
        if (!element) {
            throw new Error(Localization.dictionary.SVG_PROGRESS_SVGIsMissingError);
        }
        this.rootElement = element;
        this.id = this.rootElement.id;

        if (options) {
            this.options.height = options.height;
            this.options.width = options.width || this.rootElement.parentElement?.clientWidth;
            this.options.data = options.data;
            this.options.time = options.time;
            this.options.barHeight = options.barHeight || this.options.barHeight;
            this.options.tooltipHeight = options.renderTooltip ? options.tooltipHeight || 30 : 0;
            this.options.renderTooltip = options.renderTooltip;
            this.options.bufferTop = options.renderTooltip ? 10 + this.options.tooltipHeight : 0;
            this.options.renderBuffer = options.renderBuffer;
            this.options.renderSeek = options.renderSeek;
            this.options.renderProgress = options.renderProgress;
            this.options.disableCursor = options.disableCursor;
            this.options.top = options.top || 0;
        }
        this.rootElement.setAttribute('height', this.options.height.toString());
        this.rootElement.setAttribute('width', '100%');
        this.components = {
            progressBar: {
                bar: null,
                buffer: null,
                progress: null,
                tooltip: null,
                seekBar: null
            },
            events: []
        };

        this.init();
    }

    public set activeSegmentCallback(callback: (segment: IUISegmentEventData) => void) {
        this._activeSegmentCallback = callback;
    }

    public set segmentStartCallback(callback: (segment: IUISegmentEventData) => void) {
        this._segmentStartCallback = callback;
    }

    public addClass(cls: string) {
        if ('classList' in this.rootElement) {
            this.rootElement.classList.add(cls);
        } else {
            // Up casting root element to Element
            const el: Element = this.rootElement;

            if (el) {
                el.className = el.className + ' ' + cls;
            }
        }
    }

    public onSetProgress(callback: Function) {
        const instance = this;
        if (!callback) {
            return;
        }

        this.components.progressBar.bar._el.addEventListener('click', (e: MouseEvent) => {
            if (this.options.disableCursor) {
                return;
            }

            const percent = e.offsetX / instance.options.width;
            const time = Math.round(percent * instance.options.time);
            callback(time);
        });
    }

    public setProgress(time: number) {
        const timeType = typeof time;
        // Make sure the time not pass the max duration
        time = Math.min(time, this.options.time);
        if (Math.abs(time - this.options.time) < 0.5) {
            time = Math.ceil(time);
        }

        const segmentEvent = this.updateActiveRect(time);
        this.activeSegment = segmentEvent ? segmentEvent.segment : null;

        this.setProgressBarProgress(timeType, time);
        this.setSeekBarProgress(timeType, time);
    }

    public setPreBuffer(time: number) {
        time = Math.min(time, this.options.time);
        const per = time / this.options.time;
        let pixels = per * this.options.width - this.components.progressBar.tooltip?.width / 2;
        pixels = Math.max(Math.min(pixels, this.options.width - this.components.progressBar.tooltip?.width), 0);

        this.components.progressBar.tooltip?.show();
        if (this.options.renderBuffer) {
            this.components.progressBar.buffer.show();
            this.setBuffer(time);
        }
        this.components.progressBar.tooltip?.moveTo(pixels, time);
    }

    public clearEvents() {
        this.components.progressBar.bar._el.removeEventListener('click', this.handleMouseClick.bind(this));
        this.components.progressBar.bar._el.removeEventListener('mouseleave', this.handleMouseLeave.bind(this));
        this.components.progressBar.bar._el.removeEventListener('mousemove', this.handleMouseMove.bind(this));

        this.components.events.forEach((e) => {
            e._el.removeEventListener('click', this.handleMouseClick.bind(this));
            e._el.removeEventListener('mouseleave', this.handleMouseLeave.bind(this));
            e._el.removeEventListener('mousemove', this.handleMouseMove.bind(this));
        });
    }

    public setWidth(w?: number) {
        if (w) {
            this.options.width = w;
        } else {
            this.options.width = this.rootElement.parentElement.clientWidth;
        }
    }

    public destroy() {
        // Remove events
        this.clearEvents();

        // Remove elements
        this.components.events.forEach((e) => e.remove());

        // Remove components
        Object.keys(this.components.progressBar).forEach((c) => {
            if (this.components.progressBar[c]) {
                this.components.progressBar[c].remove();
            }
        });
    }

    public setData(data: IChartData[]) {
        // If new data obj less than what exists than delete data.
        this.components.events.forEach((e) => {
            e.remove();
        });

        // Reset
        this.components.events.length = 0;

        // Create events
        data.forEach((event, i) => {
            if (!event.x) {
                event.x = i ? this.options.data[i - 1].x + this.options.data[i - 1].width : 0;
            }
            // If event created - just modify the props.
            if (this.components.events && this.components.events[i] && this.components.events[i]._el) {
                this.components.events[i].x = event.x;
                this.components.events[i].width = event.width;
                this.components.events[i].type = event.type || 'default';
                this.components.events[i].color = event.color ? event.color : Colors[event.type || 'default'];

                if (
                    this.components.events[i].width &&
                    this.components.events[i].x &&
                    this.components.events[i].type &&
                    this.components.events[i].color
                ) {
                    this.components.events[i].update();
                }
            } else {
                const newEvent = new Rect(
                    this.options.barHeight,
                    event.width,
                    event.x,
                    10 + this.options.tooltipHeight + this.options.top,
                    event.color
                );
                newEvent.type = event.type;
                newEvent.start = event.start;
                newEvent.end = event.end;
                newEvent.addClass(event.type || 'default');
                this.components.events.push(newEvent);
                if (this.components.progressBar.tooltip) {
                    // prepend
                    this.components.progressBar.tooltip._el.parentNode.insertBefore(newEvent._el, this.components.progressBar.tooltip._el);
                } else {
                    this.rootElement.appendChild(newEvent._el);
                }

                newEvent._el.addEventListener('click', this.handleMouseClick.bind(this));
                newEvent._el.addEventListener('mouseleave', this.handleMouseLeave.bind(this));
                newEvent._el.addEventListener('mousemove', this.handleMouseMove.bind(this));
            }
        });
    }

    public setTabIndex(newTabIndex: string): void {
        this.components.events.forEach((event) => {
            event._el.setAttribute('tabindex', newTabIndex);

            if (newTabIndex) {
                event._el.addEventListener('focus', this.handleFocus.bind(this));
                event._el.addEventListener('focusout', this.handelFocusOut.bind(this));
            } else {
                event._el.removeEventListener('focus', this.handleFocus.bind(this));
                event._el.addEventListener('focusout', this.handelFocusOut.bind(this));
            }
        });
    }

    private setBuffer(time: number) {
        time = Math.min(time, this.options.time);
        const that = this;
        if (!time) {
            return;
        }
        const value = Math.min((time / that.options.time) * 100, that.options.time);
        window.requestAnimationFrame(() => {
            that.components.progressBar.buffer.moveTo(value);
        });
    }

    private handleMouseLeave() {
        window.requestAnimationFrame(() => {
            this.components.progressBar.tooltip?.hide();
            if (this.options.renderBuffer) {
                this.components.progressBar.buffer.hide();
            }
        });
    }

    private handelFocusOut() {
        window.requestAnimationFrame(() => {
            this.components.progressBar.tooltip?.hide();
            if (this.options.renderBuffer) {
                this.components.progressBar.buffer.hide();
            }
        });
    }

    private setProgressBarProgress(timeType: string, time: number) {
        if (timeType === 'undefined' || !this.options.renderProgress) {
            return;
        }

        // Make sure value is max 100%.
        const value = Math.min((time / this.options.time) * 100, 100);
        this.components.progressBar.progress.moveTo(value);
    }

    private setSeekBarProgress(timeType: string, time: number) {
        if (timeType === 'undefined' || !this.options.renderSeek) {
            return;
        }

        // Make sure value is max 100%.
        const per = time / this.options.time;
        let pixels = per * this.options.width;
        pixels = Math.max(Math.min(pixels, this.options.width), 0);

        this.components.progressBar.seekBar.moveTo(pixels, time);
    }

    private handleFocus(e: FocusEvent) {
        const position: SVGAnimatedLength = e.currentTarget['x'];
        const widthObj: SVGAnimatedLength = e.currentTarget['width'];
        if (position) {
            const xPosition = position.animVal.value;
            const width = widthObj.animVal.value;
            // Reset tooltip
            this.components.progressBar.tooltip?.moveTo(0, 0);

            // Move tooltip to the middle of the event
            this.moveTooltip(xPosition + width / 2);
        }
    }

    private handleMouseMove(e: MouseEvent) {
        this.moveTooltip(e.offsetX);
    }

    private moveTooltip(xPosition: number) {
        if (!this.options.renderTooltip) {
            return;
        }

        const time = (xPosition / this.options.width) * this.options.time;

        clearTimeout(this.timer);

        this.timer = setTimeout(() => {
            this.lastMatch = false;
            this.components.events.forEach((event) => {
                if (!event._el) {
                    return;
                }

                if (
                    xPosition >= (event.x * this.options.width) / 100 &&
                    xPosition < ((event.x + event.width) / 100) * this.options.width &&
                    event.type !== 'neutral'
                ) {
                    this.lastMatch = true;
                    if (event.type !== this.currentTooltipType) {
                        window.requestAnimationFrame(() => {
                            this.components.progressBar.tooltip?.removeClass(this.currentTooltipType);
                            this.currentTooltipType = event.type || 'default';
                            this.components.progressBar.tooltip?.addClass(this.currentTooltipType);
                            this.components.progressBar.tooltip?.updateColor(event.color);
                        });
                    }
                } else {
                    this.components.progressBar.tooltip?.updateColor();
                }

                // Set tooltip text, add event type of there was a focus event
                this.components.progressBar.tooltip?.setText(time);
            });

            if (!this.lastMatch) {
                this.components.progressBar.tooltip?.removeClass(this.currentTooltipType);
                this.currentTooltipType = 'neutral';
            }

            window.requestAnimationFrame(() => {
                this.setPreBuffer(time);
            });
        }, 10);
    }

    private handleMouseClick(e: MouseEvent) {
        const rect = this.rootElement.getBoundingClientRect();
        const min = 0;
        const max = this.options.time;

        // Calculate the range value based on the touch position.

        // Pixels from the left of the range element
        const touchPosition = e.clientX - rect.left;

        // Pixels per unit value of the range element.
        const scale = (max - min) / rect.width;

        // Touch position in units, which may be outside the allowed range.
        let time = min + scale * touchPosition;

        // Keep value within bounds.
        if (time < min) {
            time = min;
        } else if (time > max) {
            time = max;
        }

        const activeEvent = this.updateActiveRect(time, false);
        this.activeSegment = activeEvent ? activeEvent.segment : null;
        if (this._activeSegmentCallback && this.activeSegment) {
            this._activeSegmentCallback({ segment: this.activeSegment, time: activeEvent?.time });
        }

        const percent = (touchPosition / rect.width) * 100;

        if (this.options.renderProgress) {
            window.requestAnimationFrame(() => {
                this.components.progressBar.progress.moveTo(percent);
            });
        }

        // Make sure value is max 100%.
        const per = time / this.options.time;
        let pixels = per * this.options.width;
        pixels = Math.max(Math.min(pixels, this.options.width), 0);

        if (this.options.renderSeek) {
            window.requestAnimationFrame(() => {
                this.components.progressBar.seekBar.moveTo(pixels, time);
            });
        }
    }

    private updateActiveRect(time: number, emitEvent = true): IUISegmentEventData {
        if (this.activeRect) {
            const startTime = this.activeRect.start || (this.activeRect.x / 100) * this.options.time;
            const endTime = this.activeRect.end || (this.activeRect.width / 100) * this.options.time + startTime;
            if (startTime <= time && endTime >= time) {
                return {
                    segment: {
                        startSeconds: startTime,
                        endSeconds: endTime,
                        color: this.activeRect.color
                    },
                    time: time
                };
            } else {
                this.activeRect.removeClass('active');
                this.activeRect = null;
            }
        }

        for (const rect of this.components.events) {
            const startTime = rect.start || (rect.x / 100) * this.options.time;
            const endTime = rect.end || (rect.width / 100) * this.options.time + startTime;
            if (startTime <= time && endTime >= time) {
                // New active segment
                this.activeRect = rect;
                this.activeRect.addClass('active');
                if (this._segmentStartCallback && emitEvent) {
                    this._segmentStartCallback({
                        segment: {
                            startSeconds: startTime,
                            endSeconds: endTime,
                            color: rect.color
                        },
                        time: startTime
                    });
                }
                return {
                    segment: {
                        startSeconds: startTime,
                        endSeconds: endTime,
                        color: rect.color
                    },
                    time: time
                };
            }
        }

        // Fallback - select the closest rect
        let closestRect: Rect = null;
        for (const rect of this.components.events) {
            const startTime = rect.start || (rect.x / 100) * this.options.time;
            if (!closestRect) {
                closestRect = rect;
            } else {
                const closestRectStartTime = closestRect.start || (closestRect.x / 100) * this.options.time;
                if (closestRect === null || Math.abs(closestRectStartTime - time) > Math.abs(startTime - time)) {
                    closestRect = rect;
                }
            }
        }

        if (closestRect) {
            this.activeRect = closestRect;
            this.activeRect.addClass('active');
            if (this._segmentStartCallback && emitEvent) {
                this._segmentStartCallback({
                    segment: {
                        startSeconds: closestRect.start,
                        endSeconds: closestRect.end,
                        color: closestRect.color
                    },
                    time: closestRect.start
                });
            }
            return {
                segment: {
                    startSeconds: closestRect.start,
                    endSeconds: closestRect.end,
                    color: closestRect.color
                },
                time: closestRect.start
            };
        }
        return null;
    }

    private init() {
        let progress;
        let seek;
        let bufferProgress;
        // Create progress bar
        // 1. Create the bar element
        const bar = new Rect(this.options.barHeight, 100, 0, this.options.tooltipHeight + 10 + this.options.top);
        bar.addClass('bar');
        this.rootElement.appendChild(bar._el);
        this.components.progressBar.bar = bar;

        // 2. Create the progress element
        if (this.options.renderProgress) {
            progress = new Rect(5, 1, 0, 10 + this.options.barHeight + this.options.tooltipHeight + this.options.top);
            progress.addClass('progress');
            progress.moveTo(0);
        }

        if (this.options.renderSeek) {
            seek = new SeekBar(
                this.options.barHeight + 10,
                2,
                0,
                2 + this.options.tooltipHeight + this.options.top,
                6,
                '',
                this.options.renderSeek.seekBarTopColor,
                this.options.renderSeek.seekBarBodyColor
            );
            seek.addClass('seek-bar');
            seek.moveTo(0, 0);
        }

        // 3. Create the dragging overlay progress
        if (this.options.renderBuffer) {
            bufferProgress = new Rect(this.options.barHeight, 1, 0, this.options.bufferTop + this.options.top);
            this.rootElement.appendChild(bufferProgress._el);
            this.components.progressBar.buffer = bufferProgress;
            bufferProgress.addClass('buffer');
            bufferProgress.moveTo(0);
        }

        if (this.options.renderProgress) {
            this.rootElement.appendChild(progress._el);
            this.components.progressBar.progress = progress;
        }

        // 4. Create timeline rects from data if exists
        if (this.options.data) {
            this.setData(this.options.data);
        }

        if (this.options.renderSeek) {
            this.rootElement.appendChild(seek._el);
            this.components.progressBar.seekBar = seek;
        }

        // 5. Create the tooltip
        if (this.options.renderTooltip) {
            const tooltip = new Tooltip(this.options.tooltipHeight, this.options.tooltipHeight * 2.4 + this.options.top, 0, 2, '00:00:00');
            this.components.progressBar.tooltip = tooltip;
            this.rootElement.appendChild(tooltip._el);
        }

        // 6. Add event listeners
        this.components.progressBar.bar._el.addEventListener('mouseleave', this.handleMouseLeave.bind(this));
        this.components.progressBar.bar._el.addEventListener('mousemove', this.handleMouseMove.bind(this));
        if (this.options.disableCursor) {
            this.components.progressBar.bar._el.style.cursor = 'not-allowed';
        } else {
            this.components.progressBar.bar._el.addEventListener('click', this.handleMouseClick.bind(this));
        }

        this.rootElement.setAttribute('class', 'show');
    }
}

// Expose instance globally
window['SVGProgressChart'] = SVGProgressChart || {};
