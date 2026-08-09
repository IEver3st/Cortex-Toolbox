import {
  Children,
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type HTMLAttributes,
  type ReactNode,
} from 'react';
import { ArrowDown } from 'lucide-react';

function classes(...values: (string | false | null | undefined)[]): string {
  return values.filter(Boolean).join(' ');
}

interface ScrollerContextValue {
  attachViewport: (viewport: HTMLDivElement | null) => void;
  atLiveEdge: boolean;
  jumpToLatest: () => void;
  pauseFollowing: () => void;
  updateLiveEdge: (atEnd: boolean) => void;
}

const ScrollerContext = createContext<ScrollerContextValue | null>(null);

export function MessageScrollerProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const viewportRef = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  const [atLiveEdge, setAtLiveEdge] = useState(true);

  const measure = () => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const atEnd = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 40;
    setAtLiveEdge(atEnd);
    if (atEnd) following.current = true;
  };

  const jumpToLatest = () => {
    following.current = true;
    viewportRef.current?.scrollTo({ top: viewportRef.current.scrollHeight, behavior: 'smooth' });
  };
  const pauseFollowing = () => {
    following.current = false;
  };
  const updateLiveEdge = (atEnd: boolean) => {
    setAtLiveEdge(atEnd);
    if (atEnd) following.current = true;
  };
  const attachViewport = (viewport: HTMLDivElement | null) => {
    viewportRef.current = viewport;
  };

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const content = viewport.firstElementChild;
    if (!content) return;
    const observer = new MutationObserver(() => {
      if (following.current) viewport.scrollTop = viewport.scrollHeight;
      measure();
    });
    observer.observe(content, { childList: true, subtree: true, characterData: true });
    viewport.scrollTop = viewport.scrollHeight;
    return () => observer.disconnect();
  }, []);

  return (
    <ScrollerContext.Provider
      value={{ attachViewport, atLiveEdge, jumpToLatest, pauseFollowing, updateLiveEdge }}
    >
      {children}
    </ScrollerContext.Provider>
  );
}

export function MessageScroller({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>): React.JSX.Element {
  return <div className={classes('ai-message-scroller', className)} {...props} />;
}

export function MessageScrollerViewport({
  className,
  onScroll,
  onWheel,
  onPointerDown,
  ...props
}: HTMLAttributes<HTMLDivElement>): React.JSX.Element {
  const context = useContext(ScrollerContext);
  const viewportRef = useRef<HTMLDivElement>(null);
  if (!context) throw new Error('MessageScrollerViewport requires MessageScrollerProvider.');
  const { attachViewport } = context;
  useEffect(() => {
    attachViewport(viewportRef.current);
    return () => attachViewport(null);
  }, [attachViewport]);
  return (
    <div
      ref={viewportRef}
      className={classes('ai-message-scroller-viewport', className)}
      onScroll={(event) => {
        const viewport = event.currentTarget;
        const atEnd = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 40;
        context.updateLiveEdge(atEnd);
        if (!atEnd) {
          // The reader moved away from the live edge; streaming must not steal their place.
          viewport.dataset.readerAway = 'true';
          context.pauseFollowing();
        } else {
          delete viewport.dataset.readerAway;
        }
        onScroll?.(event);
      }}
      onWheel={(event) => {
        if (event.deltaY < 0) {
          context.pauseFollowing();
          event.currentTarget.setAttribute('data-reader-away', 'true');
        }
        onWheel?.(event);
      }}
      onPointerDown={(event) => {
        context.pauseFollowing();
        event.currentTarget.setAttribute('data-reader-away', 'true');
        onPointerDown?.(event);
      }}
      {...props}
    />
  );
}

export function MessageScrollerContent({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>): React.JSX.Element {
  return (
    <div
      className={classes('ai-message-scroller-content', className)}
      aria-live="polite"
      aria-relevant="additions text"
      {...props}
    />
  );
}

export function MessageScrollerItem({
  className,
  ...props
}: HTMLAttributes<HTMLElement>): React.JSX.Element {
  return <article className={classes('ai-message-scroller-item', className)} {...props} />;
}

export function MessageScrollerButton(): React.JSX.Element | null {
  const context = useContext(ScrollerContext);
  if (!context || context.atLiveEdge) return null;
  return (
    <button type="button" className="ai-jump-latest" onClick={context.jumpToLatest}>
      <ArrowDown aria-hidden="true" /> Jump to latest
    </button>
  );
}

export function Message({
  align = 'start',
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & { align?: 'start' | 'end' }): React.JSX.Element {
  return <div className={classes('ai-message', `is-${align}`, className)} {...props} />;
}

export function MessageHeader({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>): React.JSX.Element {
  return <div className={classes('ai-message-header', className)} {...props} />;
}

export function MessageContent({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>): React.JSX.Element {
  return <div className={classes('ai-message-content', className)} {...props} />;
}

export function Bubble({ className, ...props }: HTMLAttributes<HTMLDivElement>): React.JSX.Element {
  return <div className={classes('ai-bubble', className)} {...props} />;
}

export function BubbleContent({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>): React.JSX.Element {
  return (
    <div className={classes('ai-bubble-content', className)} {...props}>
      {Children.toArray(children)}
    </div>
  );
}

export function Marker({ className, ...props }: HTMLAttributes<HTMLDivElement>): React.JSX.Element {
  return <div className={classes('ai-marker', className)} {...props} />;
}

export function Attachment({
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement>): React.JSX.Element {
  return <span className={classes('ai-attachment', className)} {...props} />;
}
