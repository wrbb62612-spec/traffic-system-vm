import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/**
 * 将 Markdown 渲染为 HTML（无 raw HTML，安全默认）。
 * 用于聊天助手、后端报告等场景。
 */
export default function MarkdownContent({ children, className = '' }) {
  const text = typeof children === 'string' ? children : '';
  return (
    <div className={`markdown-body ${className}`.trim()}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
    </div>
  );
}
