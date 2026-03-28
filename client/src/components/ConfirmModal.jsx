import { createPortal } from 'react-dom';

export default function ConfirmModal({
  visible,
  title = '确认',
  message = '',
  confirmText = '确定',
  cancelText = '取消',
  onConfirm,
  onCancel
}) {
  if (!visible) return null;

  return createPortal(
    <div className="modal-mask modal-mask-top">
      <div className="modal-card small">
        <div className="modal-header">
          <span>{title}</span>
          <button className="modal-close" onClick={onCancel}>
            ×
          </button>
        </div>

        <div className="modal-body">
          <div className="modal-text">{message}</div>

          <div className="modal-footer">
            <button className="modal-btn secondary" onClick={onCancel}>
              {cancelText}
            </button>
            <button className="modal-btn danger" onClick={onConfirm}>
              {confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}