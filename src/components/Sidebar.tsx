'use client';
import { useMemo, useState } from 'react';
import type { AppState, DrawElement, SidebarTab } from '@/lib/types';
import { listComments, type SearchHit } from '@/lib/search';
import { LibraryTab, type LibItem, type LibraryActions } from './Chrome';
import { Button, Input, OptionGroup, TabBar } from './ui';

export interface SidebarActions extends LibraryActions {
  setApp: (p: Partial<AppState>) => void;
  setSearch: (q: string) => void;
  goToSearch: (i: number) => void;
  openComment: (id: string) => void;
  toggleResolve: (id: string) => void;
}

/** The right-hand panel: the library, a search over the canvas, and the list of comment threads. */
export function Sidebar({ app, elements, library, hits, actions }: { app: AppState; elements: DrawElement[]; library: LibItem[]; hits: SearchHit[]; actions: SidebarActions }) {
  const comments = useMemo(() => listComments(elements), [elements]);
  const open = comments.filter((c) => !c.resolved).length;
  const tab: SidebarTab = app.viewOnly && app.sidebarTab === 'library' ? 'search' : app.sidebarTab;
  const tabs: { value: SidebarTab; label: string; badge?: number }[] = [
    ...(app.viewOnly ? [] : [{ value: 'library' as const, label: 'Library' }]),
    { value: 'search', label: 'Search' },
    { value: 'comments', label: 'Comments', badge: open },
  ];
  return (
    <aside className="library sidebar" aria-label="Sidebar" onPointerDown={(e) => e.stopPropagation()}>
      <div className="sidebar-head">
        <TabBar label="Sidebar sections" value={tab} tabs={tabs} onChange={(v) => actions.setApp({ sidebarTab: v })} />
        <Button className="icon-btn sm" aria-label="Close sidebar" onClick={() => actions.setApp({ showLibrary: false })}>✕</Button>
      </div>
      {tab === 'library' && <LibraryTab items={library} actions={actions} />}
      {tab === 'search' && <SearchTab app={app} hits={hits} actions={actions} />}
      {tab === 'comments' && <CommentsTab app={app} comments={comments} actions={actions} />}
    </aside>
  );
}

function SearchTab({ app, hits, actions }: { app: AppState; hits: SearchHit[]; actions: SidebarActions }) {
  const idx = hits.length ? Math.min(app.searchIdx, hits.length - 1) : -1;
  const go = (d: number) => hits.length && actions.goToSearch((idx + d + hits.length) % hits.length);
  const q = app.search.trim();
  return (
    <>
      <Input
        id="sidebar-search" className="field lib-search" aria-label="Search the canvas" placeholder="Find text on the canvas…" autoFocus
        value={app.search} onValueChange={actions.setSearch}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') { e.preventDefault(); go(e.shiftKey ? -1 : 1); }
          if (e.key === 'Escape') { if (app.search) actions.setSearch(''); else actions.setApp({ showLibrary: false }); }
        }}
      />
      <div className="search-bar">
        <span className="muted" aria-live="polite">{!q ? 'Searches text, labels, frames, Markdown, links and comments' : hits.length ? `${idx + 1} of ${hits.length}` : 'No matches'}</span>
        <span className="search-nav">
          <Button className="icon-btn sm" aria-label="Previous match" disabled={!hits.length} onClick={() => go(-1)}>↑</Button>
          <Button className="icon-btn sm" aria-label="Next match" disabled={!hits.length} onClick={() => go(1)}>↓</Button>
        </span>
      </div>
      <ul className="result-list">
        {hits.map((h, i) => (
          <li key={h.id}>
            <Button className={`result ${i === idx ? 'current' : ''}`} onClick={() => actions.goToSearch(i)}>
              <span className="result-kind">{h.label}</span>
              <span className="result-text">{h.before}<mark>{h.match}</mark>{h.after}</span>
            </Button>
          </li>
        ))}
      </ul>
    </>
  );
}

type CommentFilter = 'all' | 'open' | 'resolved';

function CommentsTab({ app, comments, actions }: { app: AppState; comments: ReturnType<typeof listComments>; actions: SidebarActions }) {
  const [filter, setFilter] = useState<CommentFilter>('all');
  const shown = comments.filter((c) => filter === 'all' || (filter === 'resolved') === c.resolved);
  return (
    <>
      <div className="comment-filter">
        <OptionGroup<CommentFilter> label="Show comments" value={filter} onChange={setFilter} options={[
          { value: 'all', label: 'All comments', node: 'All' },
          { value: 'open', label: 'Open comments', node: 'Open' },
          { value: 'resolved', label: 'Resolved comments', node: 'Resolved' },
        ]} />
      </div>
      {comments.length === 0 && <p className="muted">No comments yet. Pick the comment tool (C) and click on the canvas to start a thread.</p>}
      {comments.length > 0 && shown.length === 0 && <p className="muted">No {filter} comments.</p>}
      <ul className="result-list">
        {shown.map((c, i) => (
          <li key={c.id} className="comment-row">
            <Button className={`result ${app.activeComment === c.id ? 'current' : ''}`} onClick={() => actions.openComment(c.id)}>
              <span className="result-kind">#{comments.indexOf(c) + 1}{c.resolved ? ' · Resolved' : ''}{c.replies ? ` · ${c.replies} ${c.replies === 1 ? 'reply' : 'replies'}` : ''}</span>
              <span className="result-text">{c.first || 'Empty thread'}</span>
              {c.last > 0 && <span className="result-date">{new Date(c.last).toLocaleString()}</span>}
            </Button>
            {!app.viewOnly && <Button className="btn row-btn" aria-label={`${c.resolved ? 'Reopen' : 'Resolve'} comment ${i + 1}`} onClick={() => actions.toggleResolve(c.id)}>{c.resolved ? 'Reopen' : 'Resolve'}</Button>}
          </li>
        ))}
      </ul>
    </>
  );
}
