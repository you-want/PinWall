import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getNoteByShareToken } from '@/services/api';
import type { Note } from '@/types';

export default function PublicNote() {
  const { token } = useParams<{ token: string }>();
  const [note, setNote] = useState<Note | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchNote = async () => {
      if (!token) {
        setError('无效的分享链接');
        setIsLoading(false);
        return;
      }

      try {
        const result = await getNoteByShareToken(token);
        if (result) {
          setNote(result);
        } else {
          setError('便签不存在或未公开');
        }
      } catch {
        setError('获取便签失败');
      } finally {
        setIsLoading(false);
      }
    };

    fetchNote();
  }, [token]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center">
        <div className="text-center">
          <div className="loading-spinner" />
          <p className="mt-4 text-gray-500">加载中...</p>
        </div>
      </div>
    );
  }

  if (error || !note) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4">📭</div>
          <h1 className="text-2xl font-bold text-gray-700 mb-2">{error || '便签不存在'}</h1>
          <p className="text-gray-500 mb-6">该便签可能已被删除或未公开</p>
          <Link
            to="/"
            className="inline-flex items-center px-4 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 transition-colors"
          >
            返回首页
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div
          className="sticky-card"
          style={{ backgroundColor: note.color }}
        >
          <div className="sticky-card-header">
            <div className="window-controls">
              <button
                className={`control maximize ${note.is_checked ? 'checked' : ''}`}
                type="button"
                disabled
              />
            </div>
            <div className="card-title">
              {new Date(note.created_at).toLocaleString('zh-CN', {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                timeZone: 'Asia/Shanghai',
              })}
            </div>
          </div>
          <div className="sticky-card-body">
            <span className={note.is_checked ? 'line-through' : ''}>
              {note.content}
            </span>
          </div>
        </div>

        <div className="mt-6 text-center text-sm text-gray-400">
          <p>这是一个公开分享的便签</p>
          <p className="mt-1">分享时间: {new Date(note.updated_at).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}</p>
        </div>
      </div>
    </div>
  );
}