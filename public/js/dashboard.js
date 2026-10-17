// TaskBoard Dashboard Controller

let allBoards = [];

document.addEventListener('DOMContentLoaded', async () => {
  if (!Auth.requireAuth()) return;
  Auth.initUserNavbar();

  const user = Auth.getUser();
  if (user) {
    const welcomeEl = document.getElementById('welcome-name');
    if (welcomeEl) welcomeEl.textContent = user.name;
  }

  // Setup search input
  const searchInput = document.getElementById('board-search-input');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      filterBoards(e.target.value.trim().toLowerCase());
    });
  }

  // Setup create board buttons
  const openBtn = document.getElementById('open-create-board-btn');
  if (openBtn) openBtn.addEventListener('click', openCreateBoardModal);

  const emptyCreateBtn = document.getElementById('empty-create-board-btn');
  if (emptyCreateBtn) emptyCreateBtn.addEventListener('click', openCreateBoardModal);

  // Setup modal close/cancel buttons
  const closeCreateBtn = document.getElementById('close-create-board-btn');
  if (closeCreateBtn) closeCreateBtn.addEventListener('click', closeCreateBoardModal);

  const cancelCreateBtn = document.getElementById('cancel-create-board-btn');
  if (cancelCreateBtn) cancelCreateBtn.addEventListener('click', closeCreateBoardModal);

  const closeEditBtn = document.getElementById('close-edit-board-btn');
  if (closeEditBtn) closeEditBtn.addEventListener('click', closeEditBoardModal);

  const cancelEditBtn = document.getElementById('cancel-edit-board-btn');
  if (cancelEditBtn) cancelEditBtn.addEventListener('click', closeEditBoardModal);

  const closeDeleteBtn = document.getElementById('close-delete-board-btn');
  if (closeDeleteBtn) closeDeleteBtn.addEventListener('click', closeDeleteBoardModal);

  const cancelDeleteBtn = document.getElementById('cancel-delete-board-btn');
  if (cancelDeleteBtn) cancelDeleteBtn.addEventListener('click', closeDeleteBoardModal);

  // Forms and actions
  const createForm = document.getElementById('create-board-form');
  if (createForm) createForm.addEventListener('submit', handleCreateBoard);

  const editForm = document.getElementById('edit-board-form');
  if (editForm) editForm.addEventListener('submit', handleEditBoard);

  const confirmDeleteBtn = document.getElementById('confirm-delete-board-btn');
  if (confirmDeleteBtn) confirmDeleteBtn.addEventListener('click', handleConfirmDeleteBoard);

  await loadBoards();
});

async function loadBoards() {
  const grid = document.getElementById('boards-grid');

  try {
    const data = await API.get('/api/boards');
    allBoards = data.boards || [];
    renderBoards(allBoards);
    updateStats(allBoards);
    renderRecentSidebar(allBoards);
  } catch (err) {
    console.error('Failed to load boards:', err.message || err);
    showToast('Failed to load boards. Please refresh.', 'error');
    if (grid) {
      grid.innerHTML = `<div style="grid-column: 1/-1; padding: 20px; color: var(--danger); text-align: center;">Error loading boards: ${escapeHtml(err.message)}</div>`;
    }
  }
}

function updateStats(boards) {
  const boardsCountEl = document.getElementById('stat-boards-count');
  const tasksCountEl = document.getElementById('stat-tasks-count');
  const membersCountEl = document.getElementById('stat-members-count');

  const totalBoards = boards.length;
  const totalTasks = boards.reduce((acc, b) => acc + (b.task_count || 0), 0);
  const totalMembers = boards.reduce((acc, b) => acc + (b.member_count || 0), 0);

  if (boardsCountEl) boardsCountEl.textContent = totalBoards;
  if (tasksCountEl) tasksCountEl.textContent = totalTasks;
  if (membersCountEl) membersCountEl.textContent = totalMembers;
}

function renderRecentSidebar(boards) {
  const sidebarList = document.getElementById('recent-boards-list');
  if (!sidebarList) return;

  if (boards.length === 0) {
    sidebarList.innerHTML = '<div style="padding: 6px 12px; font-size: 12px; color: var(--sidebar-text-muted);">No boards yet</div>';
    return;
  }

  sidebarList.innerHTML = '';
  boards.slice(0, 6).forEach(board => {
    const link = document.createElement('a');
    link.href = `board.html?id=${encodeURIComponent(board.id)}`;
    link.className = 'recent-board-link';
    link.innerHTML = `
      <span class="recent-board-dot"></span>
      <span style="overflow: hidden; text-overflow: ellipsis;">${escapeHtml(board.name)}</span>
    `;
    sidebarList.appendChild(link);
  });
}

function renderBoards(boards) {
  const grid = document.getElementById('boards-grid');
  const emptyState = document.getElementById('boards-empty-state');
  const countLabel = document.getElementById('boards-count-label');

  if (countLabel) {
    countLabel.textContent = `${boards.length} board${boards.length === 1 ? '' : 's'}`;
  }

  if (boards.length === 0) {
    if (grid) grid.style.display = 'none';
    if (emptyState) emptyState.style.display = 'block';
    return;
  }

  if (emptyState) emptyState.style.display = 'none';
  if (grid) {
    grid.style.display = 'grid';
    grid.innerHTML = '';

    const currentUser = Auth.getUser();

    boards.forEach(board => {
      const card = document.createElement('div');
      card.className = 'board-card';
      card.dataset.boardId = board.id;

      const isOwner = board.role === 'owner' || (currentUser && currentUser.id === board.owner_id);
      const roleClass = isOwner ? 'owner' : 'member';
      const roleText = isOwner ? 'Owner' : 'Member';

      card.innerHTML = `
        <div class="board-card-header">
          <h3 class="board-card-title">${escapeHtml(board.name)}</h3>
          <span class="board-role-badge ${roleClass}">${roleText}</span>
        </div>

        <p class="board-card-desc">${board.description ? escapeHtml(board.description) : '<em style="color: var(--text-muted);">No description provided</em>'}</p>

        <div class="board-card-footer">
          <div class="board-card-stats">
            <span title="Tasks in board">📝 <strong>${Number(board.task_count) || 0}</strong> tasks</span>
            <span title="Members in board">👥 <strong>${Number(board.member_count) || 0}</strong></span>
          </div>

          <div class="board-card-actions">
            ${isOwner ? `
              <button type="button" class="btn btn-secondary btn-sm btn-edit-board" title="Rename board">
                ✏️
              </button>
              <button type="button" class="btn btn-secondary btn-sm btn-delete-board" title="Delete board" style="color: var(--danger);">
                🗑️
              </button>
            ` : ''}
            <a href="board.html?id=${encodeURIComponent(board.id)}" class="btn btn-primary btn-sm btn-open-board">
              Open &rarr;
            </a>
          </div>
        </div>
      `;

      // Safe event listener binding
      const editBtn = card.querySelector('.btn-edit-board');
      if (editBtn) {
        editBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          openEditBoardModal(board.id, board.name, board.description || '');
        });
      }

      const deleteBtn = card.querySelector('.btn-delete-board');
      if (deleteBtn) {
        deleteBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          openDeleteBoardModal(board.id, board.name);
        });
      }

      const openLink = card.querySelector('.btn-open-board');
      if (openLink) {
        openLink.addEventListener('click', (e) => {
          e.stopPropagation();
        });
      }

      card.addEventListener('click', () => {
        window.location.href = `board.html?id=${encodeURIComponent(board.id)}`;
      });

      grid.appendChild(card);
    });
  }
}

function filterBoards(term) {
  if (!term) {
    renderBoards(allBoards);
    return;
  }
  const filtered = allBoards.filter(b => 
    (b.name && b.name.toLowerCase().includes(term)) || 
    (b.description && b.description.toLowerCase().includes(term))
  );
  renderBoards(filtered);
}

// Modal Handlers
function openCreateBoardModal() {
  document.getElementById('new-board-name').value = '';
  document.getElementById('new-board-desc').value = '';
  document.getElementById('create-board-modal').classList.add('open');
  setTimeout(() => {
    const el = document.getElementById('new-board-name');
    if (el) el.focus();
  }, 50);
}

function closeCreateBoardModal() {
  const modal = document.getElementById('create-board-modal');
  if (modal) modal.classList.remove('open');
}

async function handleCreateBoard(e) {
  e.preventDefault();
  const nameInput = document.getElementById('new-board-name');
  const descInput = document.getElementById('new-board-desc');

  const name = nameInput ? nameInput.value.trim() : '';
  const description = descInput ? descInput.value.trim() : '';

  if (!name) return;

  const submitBtn = document.getElementById('create-board-submit-btn');
  if (submitBtn) submitBtn.disabled = true;

  try {
    const data = await API.post('/api/boards', { name, description });
    showToast(`Board "${data.board.name}" created!`, 'success');
    closeCreateBoardModal();
    // Redirect directly into new board
    window.location.href = `board.html?id=${encodeURIComponent(data.board.id)}`;
  } catch (err) {
    showToast(err.message || 'Failed to create board.', 'error');
    if (submitBtn) submitBtn.disabled = false;
  }
}

function openEditBoardModal(id, name, desc) {
  document.getElementById('edit-board-id').value = id;
  document.getElementById('edit-board-name').value = name;
  document.getElementById('edit-board-desc').value = desc || '';
  document.getElementById('edit-board-modal').classList.add('open');
}

function closeEditBoardModal() {
  const modal = document.getElementById('edit-board-modal');
  if (modal) modal.classList.remove('open');
}

async function handleEditBoard(e) {
  e.preventDefault();
  const id = document.getElementById('edit-board-id').value;
  const name = document.getElementById('edit-board-name').value.trim();
  const description = document.getElementById('edit-board-desc').value.trim();

  if (!name) return;

  try {
    await API.put(`/api/boards/${id}`, { name, description });
    showToast('Board updated successfully.', 'success');
    closeEditBoardModal();
    await loadBoards();
  } catch (err) {
    showToast(err.message || 'Failed to update board.', 'error');
  }
}

function openDeleteBoardModal(id, name) {
  document.getElementById('delete-board-id').value = id;
  document.getElementById('delete-board-title-label').textContent = `"${name}"`;
  document.getElementById('delete-board-modal').classList.add('open');
}

function closeDeleteBoardModal() {
  const modal = document.getElementById('delete-board-modal');
  if (modal) modal.classList.remove('open');
}

async function handleConfirmDeleteBoard() {
  const id = document.getElementById('delete-board-id').value;
  const btn = document.getElementById('confirm-delete-board-btn');
  if (btn) btn.disabled = true;

  try {
    await API.delete(`/api/boards/${id}`);
    showToast('Board deleted successfully.', 'success');
    closeDeleteBoardModal();
    await loadBoards();
  } catch (err) {
    showToast(err.message || 'Failed to delete board.', 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
}

window.openCreateBoardModal = openCreateBoardModal;
window.closeCreateBoardModal = closeCreateBoardModal;
window.openEditBoardModal = openEditBoardModal;
window.closeEditBoardModal = closeEditBoardModal;
window.openDeleteBoardModal = openDeleteBoardModal;
window.closeDeleteBoardModal = closeDeleteBoardModal;
