/**
 * members.js - Member Management Module
 * Add, Edit, Toggle Active/Paused Status, and Remove Members.
 */

const Members = {
  editingMemberId: null,

  init() {
    this.bindEvents();
    this.render();
  },

  bindEvents() {
    // Open modal from Header button
    const btnOpenNew = document.getElementById('btnOpenNewMember');
    if (btnOpenNew) {
      btnOpenNew.addEventListener('click', () => this.openAddModal());
    }

    // Open modal from Members tab button
    const btnCreateModal = document.getElementById('btnCreateMemberModal');
    if (btnCreateModal) {
      btnCreateModal.addEventListener('click', () => this.openAddModal());
    }

    // Save member button inside modal
    const btnSave = document.getElementById('btnSaveMember');
    if (btnSave) {
      btnSave.addEventListener('click', () => this.saveMember());
    }
  },

  openAddModal() {
    this.editingMemberId = null;
    document.getElementById('memberModalTitle').textContent = 'Thêm thành viên mới';
    document.getElementById('inputMemberId').value = '';
    document.getElementById('inputMemberName').value = '';
    document.getElementById('inputMemberPhone').value = '';
    document.getElementById('inputMemberNote').value = '';
    document.getElementById('inputMemberActive').checked = true;

    App.openModal('modalMember');
  },

  openEditModal(memberId) {
    const member = Storage.getMemberById(memberId);
    if (!member) return;

    this.editingMemberId = memberId;
    document.getElementById('memberModalTitle').textContent = 'Chỉnh sửa thông tin thành viên';
    document.getElementById('inputMemberId').value = member.id;
    document.getElementById('inputMemberName').value = member.name;
    document.getElementById('inputMemberPhone').value = member.phone || '';
    document.getElementById('inputMemberNote').value = member.note || '';
    document.getElementById('inputMemberActive').checked = member.active !== false;

    App.openModal('modalMember');
  },

  saveMember() {
    const nameInput = document.getElementById('inputMemberName');
    const name = nameInput.value.trim();

    if (!name) {
      App.showToast('Vui lòng nhập họ và tên thành viên!', 'error');
      nameInput.focus();
      return;
    }

    const phone = document.getElementById('inputMemberPhone').value.trim();
    const note = document.getElementById('inputMemberNote').value.trim();
    const active = document.getElementById('inputMemberActive').checked;

    if (this.editingMemberId) {
      // Update
      Storage.updateMember(this.editingMemberId, { name, phone, note, active });
      App.showToast(`Đã cập nhật thành viên: ${name}`, 'success');
    } else {
      // Create
      Storage.addMember({ name, phone, note, active });
      App.showToast(`Đã thêm thành viên mới: ${name}`, 'success');
    }

    App.closeModal('modalMember');

    // Refresh all views
    this.render();
    if (window.Tracker) Tracker.render();
    if (window.Checkin) Checkin.render();
    if (window.Payment) Payment.render();
  },

  toggleActive(memberId) {
    const member = Storage.getMemberById(memberId);
    if (!member) return;

    const newStatus = !member.active;
    Storage.updateMember(memberId, { active: newStatus });
    App.showToast(`Đã ${newStatus ? 'kích hoạt' : 'tạm dừng'} thành viên: ${member.name}`, 'info');

    this.render();
    if (window.Tracker) Tracker.render();
    if (window.Checkin) Checkin.render();
    if (window.Payment) Payment.render();
  },

  deleteMember(memberId) {
    const member = Storage.getMemberById(memberId);
    if (!member) return;

    const confirmMsg = `Bạn có chắc chắn muốn xóa thành viên "${member.name}" không?\n(Lưu ý: Dữ liệu điểm danh của thành viên này sẽ không còn hiển thị)`;
    if (confirm(confirmMsg)) {
      Storage.deleteMember(memberId);
      App.showToast(`Đã xóa thành viên: ${member.name}`, 'info');

      this.render();
      if (window.Tracker) Tracker.render();
      if (window.Checkin) Checkin.render();
      if (window.Payment) Payment.render();
    }
  },

  render() {
    const members = Storage.getMembers();
    const container = document.getElementById('membersCardGrid');
    if (!container) return;

    if (members.length === 0) {
      container.innerHTML = `
        <div style="grid-column: 1/-1; text-align: center; padding: 48px 20px; background: var(--bg-surface); border-radius: var(--radius-lg); border: 1px solid var(--border-default);">
          <div style="font-size: 36px; margin-bottom: 12px;">👥</div>
          <h3 style="margin-bottom: 6px;">Chưa có thành viên nào</h3>
          <p style="color: var(--text-muted); font-size: 13.5px; margin-bottom: 16px;">
            Hãy thêm người tham gia ăn trưa để bắt đầu theo dõi và thu tiền.
          </p>
          <button class="btn btn-primary" onclick="Members.openAddModal()">
            + Thêm thành viên đầu tiên
          </button>
        </div>
      `;
      return;
    }

    let cardsHtml = '';
    members.forEach(member => {
      const nameParts = member.name.trim().split(' ');
      const initials = nameParts.length > 1 
        ? nameParts[0][0] + nameParts[nameParts.length - 1][0] 
        : member.name.slice(0, 2);

      cardsHtml += `
        <div class="member-admin-card">
          <div class="member-admin-top">
            <div class="member-avatar-info">
              <div class="member-avatar" style="${member.active ? '' : 'opacity: 0.5;'}">
                ${initials.toUpperCase()}
              </div>
              <div class="member-name-block">
                <strong>${window.escapeHtml(member.name)}</strong>
                <span class="member-subtext">${window.escapeHtml(member.phone || 'Chưa có SĐT')}</span>
              </div>
            </div>
            
            <span class="member-status-pill ${member.active ? 'status-active' : 'status-paused'}">
              ${member.active ? 'Đang ăn' : 'Tạm nghỉ'}
            </span>
          </div>

          ${member.note ? `
            <div style="font-size: 12.5px; color: var(--text-muted); background: var(--bg-surface-subtle); padding: 8px 12px; border-radius: var(--radius-sm);">
              💬 ${window.escapeHtml(member.note)}
            </div>
          ` : ''}

          <div class="member-admin-actions">
            <button class="btn btn-sm btn-subtle" onclick="Members.openEditModal('${window.escapeHtml(member.id)}')" title="Sửa thông tin">
              ✏️ Sửa
            </button>
            <button class="btn btn-sm btn-subtle" onclick="Members.toggleActive('${window.escapeHtml(member.id)}')" title="${member.active ? 'Tạm dừng ăn cơm' : 'Kích hoạt lại'}">
              ${member.active ? '⏸️ Tạm nghỉ' : '▶️ Bật lại'}
            </button>
            <button class="btn btn-sm btn-danger" onclick="Members.deleteMember('${window.escapeHtml(member.id)}')" title="Xóa người này" style="margin-left: auto;">
              🗑️ Xóa
            </button>
          </div>
        </div>
      `;
    });

    container.innerHTML = cardsHtml;
  }
};

window.Members = Members;
