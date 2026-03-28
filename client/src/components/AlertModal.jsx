import { createPortal } from 'react-dom';

export default function AlertModal({
  visible,
  title = '提示',
  message = '',
  onClose
}) {
  if (!visible) return null;

  return createPortal(
    <div className="modal-mask modal-mask-top">
      <div className="modal-card small">
        <div className="modal-header">
          <span>{title}</span>
          <button className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="modal-body">
          <div className="modal-text">{message}</div>

          <div className="modal-footer">
            <button className="modal-btn" onClick={onClose}>
              确定
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}