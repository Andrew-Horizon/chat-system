import { useState } from 'react';

export default function CreateGroupModal({
  visible,
  onClose,
  friends,
  onSubmit
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);

  if (!visible) return null;

  const toggleFriend = (id) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSubmit = async () => {
    await onSubmit({
      name,
      description,
      inviteFriendIds: selectedIds
    });

    setName('');
    setDescription('');
    setSelectedIds([]);
  };

  return (
    <div className="modal-mask">
      <div className="modal-card">
        <div className="modal-header">
          <span>创建群聊</span>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          <div className="auth-form-item">
            <label>群名称</label>
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="auth-form-item">
            <label>群介绍</label>
            <input value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>

          <div style={{ marginTop: '14px', fontWeight: 600 }}>邀请好友</div>
          <div className="modal-result-list">
            {friends.map((item) => (
              <div key={item.id} className="modal-user-item">
                <div className="modal-user-info">
                  <div className="modal-user-avatar">
                    {(item.nickname || item.username || 'U').slice(0, 1)}
                  </div>
                  <div>
                    <div className="modal-user-name">
                      {item.nickname || item.username}
                    </div>
                    <div className="modal-user-subname">
                      用户名：{item.username}
                    </div>
                  </div>
                </div>

                <input
                  type="checkbox"
                  checked={selectedIds.includes(item.id)}
                  onChange={() => toggleFriend(item.id)}
                />
              </div>
            ))}
          </div>

          <div className="modal-footer">
            <button className="modal-btn secondary" onClick={onClose}>取消</button>
            <button className="modal-btn" onClick={handleSubmit}>创建</button>
          </div>
        </div>
      </div>
    </div>
  );
}