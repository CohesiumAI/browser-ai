/**
 * ConversationSidebar — sidebar for managing multiple conversations.
 * Allows creating, switching, and deleting conversations.
 */

'use client';

import React from 'react';
import { tokens } from './styles.js';

export interface Conversation {
  id: string;
  title: string;
  createdAt: number;
  messageCount: number;
}

export interface ConversationSidebarProps {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export function ConversationSidebar({
  conversations,
  activeId,
  onSelect,
  onCreate,
  onDelete,
  onRename,
  isCollapsed = false,
  onToggleCollapse,
}: ConversationSidebarProps) {
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editValue, setEditValue] = React.useState('');

  const handleStartEdit = (conv: Conversation) => {
    setEditingId(conv.id);
    setEditValue(conv.title);
  };

  const handleSaveEdit = () => {
    if (editingId && editValue.trim()) {
      onRename(editingId, editValue.trim());
    }
    setEditingId(null);
  };

  if (isCollapsed) {
    return (
      <div style={styles.collapsedSidebar}>
        <button onClick={onToggleCollapse} style={styles.collapseButton} title="Expand sidebar">
          ☰
        </button>
        <button onClick={onCreate} style={styles.newChatButtonCollapsed} title="New chat">
          +
        </button>
      </div>
    );
  }

  return (
    <aside style={styles.sidebar}>
      <div style={styles.header}>
        <h2 style={styles.title}>Conversations</h2>
        <button onClick={onToggleCollapse} style={styles.collapseButton} title="Collapse sidebar">
          ◀
        </button>
      </div>

      <button onClick={onCreate} style={styles.newChatButton}>
        <span style={styles.plusIcon}>+</span>
        New Chat
      </button>

      <div style={styles.conversationList}>
        {conversations.length === 0 ? (
          <p style={styles.emptyText}>No conversations yet</p>
        ) : (
          conversations.map(conv => (
            <div
              key={conv.id}
              style={{
                ...styles.conversationItem,
                backgroundColor: conv.id === activeId ? tokens.colors.bg.tertiary : 'transparent',
              }}
              onClick={() => onSelect(conv.id)}
            >
              {editingId === conv.id ? (
                <input
                  type="text"
                  value={editValue}
                  onChange={e => setEditValue(e.target.value)}
                  onBlur={handleSaveEdit}
                  onKeyDown={e => e.key === 'Enter' && handleSaveEdit()}
                  style={styles.editInput}
                  autoFocus
                  onClick={e => e.stopPropagation()}
                />
              ) : (
                <>
                  <div style={styles.convInfo}>
                    <span style={styles.convIcon}>💬</span>
                    <span style={styles.convTitle}>{conv.title}</span>
                  </div>
                  <div style={styles.convActions}>
                    <button
                      onClick={e => { e.stopPropagation(); handleStartEdit(conv); }}
                      style={styles.actionButton}
                      title="Rename"
                    >
                      ✏️
                    </button>
                    <button
                      onClick={e => { e.stopPropagation(); onDelete(conv.id); }}
                      style={styles.actionButton}
                      title="Delete"
                    >
                      🗑️
                    </button>
                  </div>
                </>
              )}
            </div>
          ))
        )}
      </div>

      <div style={styles.footer}>
        <div style={styles.footerItem}>🔒 100% Local</div>
        <div style={styles.footerItem}>🚀 WebGPU Powered</div>
      </div>
    </aside>
  );
}

const styles: Record<string, React.CSSProperties> = {
  sidebar: {
    width: '280px',
    height: '100%',
    backgroundColor: tokens.colors.bg.secondary,
    borderRight: `1px solid ${tokens.colors.border.default}`,
    display: 'flex',
    flexDirection: 'column',
    fontFamily: tokens.font.family,
  },
  collapsedSidebar: {
    width: '50px',
    height: '100%',
    backgroundColor: tokens.colors.bg.secondary,
    borderRight: `1px solid ${tokens.colors.border.default}`,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: tokens.spacing.sm,
    gap: tokens.spacing.md,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: tokens.spacing.lg,
    borderBottom: `1px solid ${tokens.colors.border.default}`,
  },
  title: {
    margin: 0,
    fontSize: tokens.font.size.lg,
    fontWeight: 600,
    color: tokens.colors.text.primary,
  },
  collapseButton: {
    background: 'none',
    border: 'none',
    fontSize: '1.2rem',
    cursor: 'pointer',
    color: tokens.colors.text.secondary,
    padding: tokens.spacing.sm,
  },
  newChatButton: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacing.sm,
    margin: tokens.spacing.md,
    padding: `${tokens.spacing.md} ${tokens.spacing.lg}`,
    backgroundColor: tokens.colors.accent.primary,
    color: '#000',
    border: 'none',
    borderRadius: tokens.radius.md,
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: tokens.font.size.md,
  },
  newChatButtonCollapsed: {
    width: '36px',
    height: '36px',
    backgroundColor: tokens.colors.accent.primary,
    color: '#000',
    border: 'none',
    borderRadius: tokens.radius.md,
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: '1.2rem',
  },
  plusIcon: {
    fontSize: '1.2rem',
  },
  conversationList: {
    flex: 1,
    overflowY: 'auto',
    padding: tokens.spacing.sm,
  },
  conversationItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: `${tokens.spacing.md} ${tokens.spacing.md}`,
    borderRadius: tokens.radius.md,
    cursor: 'pointer',
    marginBottom: tokens.spacing.xs,
    transition: `background-color ${tokens.transition.fast}`,
  },
  convInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacing.sm,
    flex: 1,
    overflow: 'hidden',
  },
  convIcon: {
    fontSize: '1rem',
  },
  convTitle: {
    fontSize: tokens.font.size.sm,
    color: tokens.colors.text.primary,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  convActions: {
    display: 'flex',
    gap: tokens.spacing.xs,
    opacity: 0.6,
  },
  actionButton: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: '0.9rem',
    padding: '2px',
  },
  editInput: {
    flex: 1,
    padding: tokens.spacing.sm,
    borderRadius: tokens.radius.sm,
    border: `1px solid ${tokens.colors.border.light}`,
    backgroundColor: tokens.colors.bg.primary,
    color: tokens.colors.text.primary,
    fontSize: tokens.font.size.sm,
  },
  emptyText: {
    textAlign: 'center',
    color: tokens.colors.text.muted,
    fontSize: tokens.font.size.sm,
    padding: tokens.spacing.xl,
  },
  footer: {
    padding: tokens.spacing.md,
    borderTop: `1px solid ${tokens.colors.border.default}`,
    fontSize: tokens.font.size.xs,
    color: tokens.colors.text.muted,
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacing.xs,
  },
  footerItem: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacing.sm,
  },
};

export default ConversationSidebar;
