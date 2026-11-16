'use client';
import { useMemo, useState } from 'react';
import type { AppState, DrawElement, SidebarTab } from '@/lib/types';
import { listComments, stepIndex, type SearchHit } from '@/lib/search';
import { LibraryTab, type LibItem, type LibraryActions } from './Chrome';
import { Tabs, TabsList, TabsPanel, TabsTab } from '@ui-sdk/react/tabs';
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '@ui-sdk/react/menu';
import { Icons } from './icons';
import { ConfirmDialog } from './ConfirmDialog';
import { Button, Input, SelectField } from './ui';

type CommentFilter = 'all' | 'open' | 'resolved';

export interface SidebarActions extends LibraryActions {
  setApp: (p: Partial<AppState>) => void;
  setSearch: (q: string) => void;
  goToSearch: (i: number) => void;
  openComment: (id: string) => void;
  toggleResolve: (id: string) => void;
  deleteComment: (id: string) => void;
}

/** The right-hand panel: the library, a search over the canvas, and the list of comment threads. */
export function Sidebar({ app, elements, library, hits, actions }: { app: AppState; elements: DrawElement[]; library: LibItem[]; hits: SearchHit[]; actions: SidebarActions }) {
  const comments = useMemo(() => listComments(elements), [elements]);
  const [filter, setFilter] = useState<CommentFilter>('all'); // kept here so it survives switching tabs
  const open = comments.filter((c) => !c.resolved).length;
  const tab: SidebarTab = app.viewOnly && app.sidebarTab === 'library' ? 'search' : app.sidebarTab;
  const tabs: { value: SidebarTab; label: string; badge?: number }[] = [
    ...(app.viewOnly ? [] : [{ value: 'library' as const, label: 'Library' }]),
    { value: 'search', label: 'Search' },
    { value: 'comments', label: 'Comments', badge: open },
  ];
  return (
    <aside className="library sidebar" aria-label="Sidebar" onPointerDown={(e) => e.stopPropagation()}>
      <Tabs value={tab} onValueChange={(v) => v && actions.setApp({ sidebarTab: v })}>
        <div className="sidebar-head">
          <TabsList className="tab-bar" aria-label="Sidebar sections">
            {tabs.map((t) => (
              <TabsTab key={t.value} value={t.value} className="tab">{t.label}{t.badge ? <span className="tab-badge">{t.badge}</span> : null}</TabsTab>
            ))}
          </TabsList>
          <Button className="icon-btn sm" aria-label="Close sidebar" onClick={() => actions.setApp({ showLibrary: false })}>✕</Button>
        </div>
        {!app.viewOnly && <TabsPanel value="library">{tab === 'library' && <LibraryTab items={library} actions={actions} />}</TabsPanel>}
        <TabsPanel value="search">{tab === 'search' && <SearchTab app={app} hits={hits} actions={actions} />}</TabsPanel>
        <TabsPanel value="comments">{tab === 'comments' && <CommentsTab app={app} comments={comments} filter={filter} onFilter={setFilter} actions={actions} />}</TabsPanel>
      </Tabs>
    </aside>
  );
}

function SearchTab({ app, hits, actions }: { app: AppState; hits: SearchHit[]; actions: SidebarActions }) {
  const idx = hits.length ? Math.min(app.searchIdx, hits.length - 1) : -1;
  const go = (d: number) => { if (hits.length) actions.goToSearch(stepIndex(idx, d, hits.length)); };
  const q = app.search.trim();
  return (
    <>
      <Input
        id="sidebar-search" className="field lib-search" aria-label="Search the canvas" placeholder="Find text on the canvas…"
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

function CommentsTab({ app, comments, filter, onFilter, actions }: { app: AppState; comments: ReturnType<typeof listComments>; filter: CommentFilter; onFilter: (f: CommentFilter) => void; actions: SidebarActions }) {
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const toDelete = comments.find((c) => c.id === confirmId) ?? null;
  const shown = comments.filter((c) => filter === 'all' || (filter === 'resolved') === c.resolved);
  return (
    <>
      <div className="comment-filter">
        <SelectField label="Show comments" className="comment-select" value={filter} onChange={(v) => onFilter(v as CommentFilter)} items={[
          { value: 'all', label: `All comments (${comments.length})` },
          { value: 'open', label: `Open (${comments.filter((c) => !c.resolved).length})` },
          { value: 'resolved', label: `Resolved (${comments.filter((c) => c.resolved).length})` },
        ]} />
      </div>
      {comments.length === 0 && <p className="muted">No comments yet. Pick the comment tool (C) and click on the canvas to start a thread.</p>}
      {comments.length > 0 && shown.length === 0 && <p className="muted">No {filter} comments.</p>}
      <ul className="result-list">
        {shown.map((c) => (
          <li key={c.id} className={`comment-card ${app.activeComment === c.id ? 'current' : ''} ${c.resolved ? 'is-resolved' : ''}`}>
            <Button className="comment-main" aria-label={`Open comment ${comments.indexOf(c) + 1}: ${c.first || 'empty thread'}`} onClick={() => actions.openComment(c.id)}>
              <span className="comment-top">
                <span className="comment-id">{comments.indexOf(c) + 1}</span>
                {c.resolved && <span className="comment-chip">Resolved</span>}
              </span>
              <span className="comment-text">{c.first || 'Empty thread'}</span>
              <span className="comment-meta">
                {c.replies > 0 && <span>{c.replies} {c.replies === 1 ? 'reply' : 'replies'}</span>}
                {c.last > 0 && <span>{new Date(c.last).toLocaleString()}</span>}
              </span>
            </Button>
            <Menu onAction={(v: string) => { if (v === 'show') actions.openComment(c.id); else if (v === 'resolve') actions.toggleResolve(c.id); else if (v === 'delete') setConfirmId(c.id); }}>
              <MenuTrigger className="icon-btn sm row-more" aria-label={`Actions for comment ${comments.indexOf(c) + 1}`}>{Icons.more}</MenuTrigger>
              <MenuContent className="menu" align="end" sideOffset={4} aria-label="Comment actions">
                <MenuItem value="show" className="menu-item"><span className="mi-icon">{Icons.locate}</span><span className="mi-label">Show on canvas</span></MenuItem>
                {!app.viewOnly && (
                  <>
                    <MenuItem value="resolve" className="menu-item"><span className="mi-icon">{Icons.check}</span><span className="mi-label">{c.resolved ? 'Reopen' : 'Resolve'}</span></MenuItem>
                    <MenuSeparator className="menu-sep" />
                    <MenuItem value="delete" className="menu-item danger"><span className="mi-icon">{Icons.trash}</span><span className="mi-label">Delete</span></MenuItem>
                  </>
                )}
              </MenuContent>
            </Menu>
          </li>
        ))}
      </ul>
      {toDelete && (
        <ConfirmDialog title="Delete this comment thread?" onClose={() => setConfirmId(null)} onConfirm={() => { actions.deleteComment(toDelete.id); setConfirmId(null); }}>
          {toDelete.replies > 0 ? `The thread and its ${toDelete.replies} ${toDelete.replies === 1 ? 'reply' : 'replies'}` : 'The thread'} will be removed from the canvas. You can undo this with Ctrl+Z.
        </ConfirmDialog>
      )}
    </>
  );
}
