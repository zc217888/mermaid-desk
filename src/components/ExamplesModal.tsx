import { useEffect } from 'react';
import { X, Sparkles } from 'lucide-react';
import { examples, type Example } from '../data/examples';

interface ExamplesModalProps {
  onClose: () => void;
  onPick: (ex: Example) => void;
}

const categoryLabel: Record<Example['category'], string> = {
  flow: '流程图',
  sequence: '时序图',
  class: '类图',
  state: '状态图',
  er: 'ER 图',
  gantt: '甘特图',
  pie: '饼图',
  journey: '用户旅程',
  git: 'Git 图',
  mindmap: '思维导图',
};

export function ExamplesModal({ onClose, onPick }: ExamplesModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="brand-logo" style={{ width: 36, height: 36 }}>
            <Sparkles size={18} />
          </div>
          <div>
            <div className="modal-title">示例画廊</div>
            <div className="modal-subtitle">点击任意卡片即可加载到编辑器</div>
          </div>
          <button className="modal-close" onClick={onClose} title="关闭 (Esc)">
            <X size={18} />
          </button>
        </div>
        <div className="modal-body">
          {examples.map((ex) => (
            <button key={ex.id} className="example-card" onClick={() => onPick(ex)}>
              <span className="example-card-category">{categoryLabel[ex.category]}</span>
              <span className="example-card-name">{ex.name}</span>
              <span className="example-card-desc">
                {ex.code.split('\n').slice(0, 2).join(' ').slice(0, 60)}…
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
