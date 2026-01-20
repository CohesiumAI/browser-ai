/**
 * @cohesiumai/ui
 * Composants UI modulaires pour browser-ai.
 * 
 * Architecture "jQuery de l'IA locale": importe uniquement ce dont tu as besoin.
 * 
 * @example
 * // Interface complète
 * import { ChatInterface } from '@cohesiumai/ui';
 * 
 * // Composants individuels
 * import { MessageBubble, InputBar, DownloadProgress } from '@cohesiumai/ui';
 */

'use client';

export {
  ChatInterface,
  type ChatInterfaceProps,
  ChatApp,
  type ChatAppProps,
  ConversationSidebar,
  type Conversation,
  type ConversationSidebarProps,
  MessageBubble,
  type Message,
  type MessageRole,
  type MessageBubbleProps,
  InputBar,
  type InputBarProps,
  DownloadProgress,
  type DownloadProgressProps,
  TypingIndicator,
  type TypingIndicatorProps,
  tokens,
  baseStyles,
} from './components/index.js';

export { AIPopover, type AIPopoverProps } from './ai-popover.js';
