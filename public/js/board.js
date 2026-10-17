// TaskBoard Kanban Board Controller
// Real HTML5 Drag-and-Drop, Real-time Filters, and Modals

let boardId = null;
let currentBoard = null;
let draggedTaskId = null;
let draggedSourceColId = null;
let currentEditingTaskId = null;
let boardStateBackup = null;

let filterState = {
  q: '',
  priority: 'all',
  assignee: 'all',
  myTasks: false
};

document.addEventListener('DOMContentLoaded', async () => {
  if (!Auth.requireAuth()) return;
  Auth.initUserNavbar();

  // Extract board ID from query params
  const urlParams = new URLSearchParams(window.location.search);
  boardId = urlParams.get('id');

  if (!boardId) {
    showToast('No board ID specified. Redirecting...', 'error');
    setTimeout(() => window.location.href = 'dashboard.html', 1000);
    return;
  }

  setupEventListeners();
  await loadBoard();
  await loadSidebarRecent();
});

// Setup Toolbar and Filter Listeners
function setupEventListeners() {
  // Search input
  const searchInput = document.getElementById('task-search-input');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      filterState.q = e.target.value.trim().toLowerCase();
      applyFilters();
    });
  }

  // Priority filter
  const prioSelect = document.getElementById('filter-priority');
  if (prioSelect) {
    prioSelect.addEventListener('change', (e) => {
      filterState.priority = e.target.value;
      applyFilters();
    });
  }

  // Assignee filter
  const assigneeSelect = document.getElementById('filter-assignee');
  if (assigneeSelect) {
    assigneeSelect.addEventListener('change', (e) => {
      filterState.assignee = e.target.value;
      applyFilters();
    });
  }

  // My Tasks button
  const myTasksBtn = document.getElementById('btn-toggle-my-tasks');
  if (myTasksBtn) {
    myTasksBtn.addEventListener('click', () => {
      filterState.myTasks = !filterState.myTasks;
      myTasksBtn.classList.toggle('btn-toggle-active', filterState.myTasks);
      applyFilters();
    });
  }

  // Clear filters button
  const clearBtn = document.getElementById('btn-clear-filters');
  if (clearBtn) {
    clearBtn.addEventListener('click', clearAllFilters);
  }

  // Form Submissions
  document.getElementById('create-task-form')?.addEventListener('submit', handleCreateTask);
  document.getElementById('add-column-form')?.addEventListener('submit', handleAddColumn);
  document.getElementById('rename-column-form')?.addEventListener('submit', handleRenameColumn);
  document.getElementById('confirm-delete-column-btn')?.addEventListener('click', handleConfirmDeleteColumn);
  document.getElementById('add-comment-form')?.addEventListener('submit', handleAddComment);
  document.getElementById('btn-save-task-changes')?.addEventListener('click', handleSaveTaskChanges);
  document.getElementById('btn-delete-task-trigger')?.addEventListener('click', () => {
    openDeleteTaskModal(currentEditingTaskId);
  });
  document.getElementById('confirm-delete-task-btn')?.addEventListener('click', handleConfirmDeleteTask);
  document.getElementById('invite-member-form')?.addEventListener('submit', handleInviteMember);
  document.getElementById('rename-board-form')?.addEventListener('submit', handleRenameBoard);
  document.getElementById('btn-edit-board-title')?.addEventListener('click', openRenameBoardModal);

  // Top Nav Buttons
  document.getElementById('board-members-stack')?.addEventListener('click', openMembersModal);
  document.getElementById('btn-open-members-modal')?.addEventListener('click', openMembersModal);
  document.getElementById('btn-open-activity-modal')?.addEventListener('click', openActivityModal);
  document.getElementById('btn-open-add-column-modal')?.addEventListener('click', openAddColumnModal);

  // Modal Close/Cancel Buttons
  document.getElementById('close-task-detail-btn')?.addEventListener('click', closeTaskDetailModal);
  document.getElementById('cancel-task-detail-btn')?.addEventListener('click', closeTaskDetailModal);
  document.getElementById('close-create-task-btn')?.addEventListener('click', closeCreateTaskModal);
  document.getElementById('cancel-create-task-btn')?.addEventListener('click', closeCreateTaskModal);
  document.getElementById('close-add-column-btn')?.addEventListener('click', closeAddColumnModal);
  document.getElementById('cancel-add-column-btn')?.addEventListener('click', closeAddColumnModal);
  document.getElementById('close-rename-column-btn')?.addEventListener('click', closeRenameColumnModal);
  document.getElementById('cancel-rename-column-btn')?.addEventListener('click', closeRenameColumnModal);
  document.getElementById('close-delete-column-btn')?.addEventListener('click', closeDeleteColumnModal);
  document.getElementById('cancel-delete-column-btn')?.addEventListener('click', closeDeleteColumnModal);
  document.getElementById('close-members-modal-btn')?.addEventListener('click', closeMembersModal);
  document.getElementById('done-members-modal-btn')?.addEventListener('click', closeMembersModal);
  document.getElementById('close-activity-modal-btn')?.addEventListener('click', closeActivityModal);
  document.getElementById('done-activity-modal-btn')?.addEventListener('click', closeActivityModal);
  document.getElementById('close-delete-task-btn')?.addEventListener('click', closeDeleteTaskModal);
  document.getElementById('cancel-delete-task-btn')?.addEventListener('click', closeDeleteTaskModal);
  document.getElementById('close-rename-board-btn')?.addEventListener('click', closeRenameBoardModal);
  document.getElementById('cancel-rename-board-btn')?.addEventListener('click', closeRenameBoardModal);
}

// Load authoritative board data from backend
async function loadBoard() {
  try {
    const data = await API.get(`/api/boards/${boardId}`);
    currentBoard = data.board;
    renderBoardHeader();
    populateAssigneeFilter();
    renderKanbanColumns();
  } catch (err) {
    console.error('Failed to load board:', err);
    showToast(err.message || 'Failed to load board data.', 'error');
    if (err.status === 403) {
      setTimeout(() => window.location.href = 'dashboard.html', 1500);
    }
  }
}

// Load recent boards in sidebar
async function loadSidebarRecent() {
  const container = document.getElementById('sidebar-recent-boards');
  if (!container) return;
  try {
    const data = await API.get('/api/boards');
    const boards = data.boards || [];
    container.innerHTML = '';
    boards.slice(0, 6).forEach(b => {
      const link = document.createElement('a');
      link.href = `board.html?id=${encodeURIComponent(b.id)}`;
      link.className = `recent-board-link ${b.id == boardId ? 'active' : ''}`;
      link.innerHTML = `
        <span class="recent-board-dot"></span>
        <span style="overflow: hidden; text-overflow: ellipsis;">${escapeHtml(b.name)}</span>
      `;
      container.appendChild(link);
    });
  } catch (e) {
    // Silent fail for sidebar
  }
}

// Render Header details
function renderBoardHeader() {
  const titleEl = document.getElementById('board-header-title');
  const sidebarBoardEl = document.getElementById('sidebar-current-board-name');
  const editTitleBtn = document.getElementById('btn-edit-board-title');

  if (titleEl) titleEl.textContent = currentBoard.name;
  if (sidebarBoardEl) sidebarBoardEl.textContent = currentBoard.name;

  const currentUser = Auth.getUser();
  const isOwner = currentBoard.user_role === 'owner' || (currentUser && currentUser.id === currentBoard.owner_id);

  if (editTitleBtn) {
    editTitleBtn.style.display = isOwner ? 'inline-flex' : 'none';
  }

  // Render members avatars stack
  const stack = document.getElementById('board-members-stack');
  if (stack) {
    stack.innerHTML = '';
    const members = currentBoard.members || [];
    members.slice(0, 4).forEach(m => {
      const av = document.createElement('div');
      av.className = 'avatar avatar-sm avatar-stack-item';
      av.title = `${m.name} (${m.role})`;
      av.textContent = Auth.getInitials(m.name);
      stack.appendChild(av);
    });
    if (members.length > 4) {
      const extra = document.createElement('div');
      extra.className = 'avatar avatar-sm avatar-stack-item';
      extra.style.background = '#475569';
      extra.textContent = `+${members.length - 4}`;
      stack.appendChild(extra);
    }
  }
}

// Populate Assignee options in toolbar filter
function populateAssigneeFilter() {
  const select = document.getElementById('filter-assignee');
  if (!select) return;

  const currentVal = select.value;
  select.innerHTML = `
    <option value="all">Assignee: All</option>
    <option value="me">Assigned to Me</option>
    <option value="unassigned">Unassigned</option>
  `;

  if (currentBoard && currentBoard.members) {
    currentBoard.members.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m.id;
      opt.textContent = m.name;
      select.appendChild(opt);
    });
  }

  select.value = currentVal;
}

// Check if a task is overdue
function isTaskOverdue(task, columnIndex, totalColumns) {
  if (!task.due_date) return false;
  // If task is in the final column ("Done"), it is completed, not overdue
  const column = currentBoard.columns.find(c => c.id === task.column_id);
  if (column && column.name.toLowerCase() === 'done') return false;
  if (columnIndex === totalColumns - 1) return false;

  const today = new Date().toISOString().split('T')[0];
  return task.due_date < today;
}

// Render all Kanban Columns and their task cards
function renderKanbanColumns() {
  const canvas = document.getElementById('kanban-canvas');
  if (!canvas) return;

  canvas.innerHTML = '';

  const columns = currentBoard.columns || [];
  const currentUser = Auth.getUser();

  columns.forEach((col, colIdx) => {
    const colEl = document.createElement('div');
    colEl.className = 'kanban-column';
    colEl.dataset.columnId = col.id;

    // Filter tasks for this column
    const filteredTasks = (col.tasks || []).filter(task => matchFilter(task));

    const isOwner = currentBoard.user_role === 'owner' || (currentUser && currentUser.id === currentBoard.owner_id);

    colEl.innerHTML = `
      <div class="column-header">
        <div class="column-header-left">
          <h2 class="column-title">${escapeHtml(col.name)}</h2>
          <span class="column-count-badge" id="col-count-${col.id}">${filteredTasks.length}</span>
        </div>
        <div style="display: flex; align-items: center; gap: 2px;">
          ${colIdx > 0 ? `
            <button type="button" class="column-menu-btn btn-col-left" title="Move column left">
              ◀
            </button>
          ` : ''}
          ${colIdx < columns.length - 1 ? `
            <button type="button" class="column-menu-btn btn-col-right" title="Move column right">
              ▶
            </button>
          ` : ''}
          <button type="button" class="column-menu-btn btn-col-rename" title="Rename column">
            ✏️
          </button>
          ${isOwner ? `
            <button type="button" class="column-menu-btn btn-col-delete" title="Delete column">
              🗑️
            </button>
          ` : ''}
        </div>
      </div>

      <div class="column-cards-container" id="cards-container-${col.id}" data-column-id="${col.id}">
        <!-- Task cards injected here -->
      </div>

      <div class="column-footer">
        <button type="button" class="btn-add-task-quick">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
          <span>Add Task</span>
        </button>
      </div>
    `;

    const leftBtn = colEl.querySelector('.btn-col-left');
    if (leftBtn) leftBtn.addEventListener('click', () => moveColumn(col.id, colIdx - 1));

    const rightBtn = colEl.querySelector('.btn-col-right');
    if (rightBtn) rightBtn.addEventListener('click', () => moveColumn(col.id, colIdx + 1));

    const renameBtn = colEl.querySelector('.btn-col-rename');
    if (renameBtn) renameBtn.addEventListener('click', () => openRenameColumnModal(col.id, col.name));

    const deleteBtn = colEl.querySelector('.btn-col-delete');
    if (deleteBtn) deleteBtn.addEventListener('click', () => openDeleteColumnModal(col.id, col.name, col.tasks ? col.tasks.length : 0));

    const addTaskBtn = colEl.querySelector('.btn-add-task-quick');
    if (addTaskBtn) addTaskBtn.addEventListener('click', () => openCreateTaskModal(col.id, col.name));

    const cardsContainer = colEl.querySelector(`#cards-container-${col.id}`);

    // Render task cards
    filteredTasks.forEach((task, taskIdx) => {
      const overdue = isTaskOverdue(task, colIdx, columns.length);
      const card = createTaskCardElement(task, overdue);
      cardsContainer.appendChild(card);
    });

    // Attach HTML5 Drag-and-Drop Listeners to Column Container
    attachColumnDragListeners(cardsContainer, col.id);

    canvas.appendChild(colEl);
  });

  // "Add Column" placeholder button at end of board
  const addColPlaceholder = document.createElement('div');
  addColPlaceholder.className = 'add-column-placeholder';
  addColPlaceholder.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <line x1="12" y1="5" x2="12" y2="19"></line>
      <line x1="5" y1="12" x2="19" y2="12"></line>
    </svg>
    <span>Add another column</span>
  `;
  addColPlaceholder.addEventListener('click', openAddColumnModal);
  canvas.appendChild(addColPlaceholder);
}

// Create Task Card DOM element with Drag and Drop and Fallback Move
function createTaskCardElement(task, overdue) {
  const card = document.createElement('div');
  card.className = `task-card ${overdue ? 'overdue' : ''}`;
  card.id = `task-card-${task.id}`;
  card.dataset.taskId = task.id;
  card.dataset.columnId = task.column_id;
  card.dataset.position = task.position;
  card.setAttribute('draggable', 'true');

  const priorityClass = task.priority ? task.priority.toLowerCase() : 'medium';

  let formattedDate = '';
  if (task.due_date) {
    const d = new Date(task.due_date + 'T00:00:00');
    formattedDate = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  card.innerHTML = `
    <div class="task-card-header">
      <span class="priority-badge ${priorityClass}">${escapeHtml(task.priority || 'medium')}</span>
      <div style="display: flex; align-items: center; gap: 6px;">
        <!-- Accessible Move dropdown button -->
        <button type="button" class="btn btn-ghost btn-sm btn-accessible-move" style="padding: 2px 6px; font-size: 11px;" title="Move to another column">
          ⇄ Move
        </button>
      </div>
    </div>

    <div class="task-title">${escapeHtml(task.title)}</div>

    ${task.description ? `<div class="task-desc-preview">${escapeHtml(task.description)}</div>` : ''}

    <div class="task-card-footer">
      <div class="task-metadata">
        ${formattedDate ? `
          <span class="meta-item ${overdue ? 'overdue-tag' : ''}" title="${overdue ? 'Overdue!' : 'Due date'}">
            📅 ${formattedDate} ${overdue ? '(Overdue)' : ''}
          </span>
        ` : ''}

        ${task.comment_count > 0 ? `
          <span class="meta-item" title="${task.comment_count} comments">
            💬 ${task.comment_count}
          </span>
        ` : ''}
      </div>

      <div>
        ${task.assignee_name ? `
          <div class="avatar avatar-sm" title="Assigned to ${escapeHtml(task.assignee_name)}">
            ${Auth.getInitials(task.assignee_name)}
          </div>
        ` : `
          <span style="font-size: 11px; color: var(--text-muted);">Unassigned</span>
        `}
      </div>
    </div>
  `;

  // Accessible Move button handler
  const moveBtn = card.querySelector('.btn-accessible-move');
  if (moveBtn) {
    moveBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openAccessibleMoveMenu(e, task.id, task.column_id);
    });
  }

  // Click card to open Detail Modal
  card.addEventListener('click', () => {
    openTaskDetailModal(task.id);
  });

  // Dragstart handler
  card.addEventListener('dragstart', (e) => {
    draggedTaskId = task.id;
    draggedSourceColId = task.column_id;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(task.id));
    setTimeout(() => card.classList.add('dragging'), 0);
  });

  // Dragend handler
  card.addEventListener('dragend', () => {
    card.classList.remove('dragging');
    removeDropIndicators();
    draggedTaskId = null;
    draggedSourceColId = null;
  });

  return card;
}

// Attach Drag & Drop handlers to Column Cards Container
function attachColumnDragListeners(container, columnId) {
  container.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    const colEl = container.closest('.kanban-column');
    if (colEl) colEl.classList.add('drag-over');

    // Calculate insertion line indicator
    const afterElement = getDragAfterElement(container, e.clientY);
    removeDropIndicators();

    const indicator = document.createElement('div');
    indicator.className = 'drop-indicator-line';
    indicator.id = 'active-drop-indicator';

    if (afterElement == null) {
      container.appendChild(indicator);
    } else {
      container.insertBefore(indicator, afterElement);
    }
  });

  container.addEventListener('dragleave', (e) => {
    // Only remove if leaving container to outside
    if (!container.contains(e.relatedTarget)) {
      const colEl = container.closest('.kanban-column');
      if (colEl) colEl.classList.remove('drag-over');
      removeDropIndicators();
    }
  });

  container.addEventListener('drop', async (e) => {
    e.preventDefault();
    const colEl = container.closest('.kanban-column');
    if (colEl) colEl.classList.remove('drag-over');

    const indicator = document.getElementById('active-drop-indicator');
    if (!indicator) return;

    // Calculate target position based on position of indicator among card elements
    const cards = [...container.querySelectorAll('.task-card:not(.dragging)')];
    const dropPosition = cards.filter(c => {
      // Elements that are above the indicator
      return (c.compareDocumentPosition(indicator) & Node.DOCUMENT_POSITION_FOLLOWING);
    }).length;

    removeDropIndicators();

    if (!draggedTaskId) return;

    await executeTaskMove(draggedTaskId, columnId, dropPosition);
  });
}

function removeDropIndicators() {
  document.querySelectorAll('.drop-indicator-line').forEach(el => el.remove());
  document.querySelectorAll('.kanban-column.drag-over').forEach(el => el.classList.remove('drag-over'));
}

// Find sibling element below pointer during dragover
function getDragAfterElement(container, y) {
  const draggableElements = [...container.querySelectorAll('.task-card:not(.dragging)')];

  return draggableElements.reduce((closest, child) => {
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closest.offset) {
      return { offset: offset, element: child };
    } else {
      return closest;
    }
  }, { offset: Number.NEGATIVE_INFINITY }).element;
}

// Execute Task Move with Optimistic UI & Transactional Backend Sync
async function executeTaskMove(taskId, targetColumnId, newPosition) {
  // Snapshot current state for rollback
  boardStateBackup = JSON.parse(JSON.stringify(currentBoard));

  // Find task and source column
  let movedTask = null;
  let sourceCol = null;

  currentBoard.columns.forEach(col => {
    const foundIdx = col.tasks ? col.tasks.findIndex(t => t.id === taskId) : -1;
    if (foundIdx !== -1) {
      sourceCol = col;
      movedTask = col.tasks.splice(foundIdx, 1)[0];
    }
  });

  if (!movedTask) return;

  const targetCol = currentBoard.columns.find(c => c.id === targetColumnId);
  if (!targetCol) return;

  if (!targetCol.tasks) targetCol.tasks = [];

  // Update local task
  movedTask.column_id = targetColumnId;
  targetCol.tasks.splice(newPosition, 0, movedTask);

  // Recalculate local positions
  targetCol.tasks.forEach((t, idx) => t.position = idx);
  if (sourceCol && sourceCol.id !== targetColumnId) {
    sourceCol.tasks.forEach((t, idx) => t.position = idx);
  }

  // Optimistically re-render
  renderKanbanColumns();

  try {
    const res = await API.patch(`/api/tasks/${taskId}/move`, {
      column_id: targetColumnId,
      position: newPosition
    });

    // Update with authoritative response
    if (res.task) {
      const idx = targetCol.tasks.findIndex(t => t.id === taskId);
      if (idx !== -1) targetCol.tasks[idx] = { ...targetCol.tasks[idx], ...res.task };
    }
  } catch (err) {
    console.error('Task move failed:', err);
    showToast('Failed to update task position. Rolling back...', 'error');
    // Rollback to authoritative backup
    currentBoard = boardStateBackup;
    renderKanbanColumns();
  }
}

// Accessible Move Popover (for mobile & keyboard accessibility)
function openAccessibleMoveMenu(event, taskId, currentColumnId) {
  const existing = document.getElementById('accessible-move-menu');
  if (existing) existing.remove();

  const menu = document.createElement('div');
  menu.id = 'accessible-move-menu';
  menu.style.position = 'absolute';
  menu.style.zIndex = '150';
  menu.style.backgroundColor = 'var(--bg-elevated)';
  menu.style.border = '1px solid var(--border-strong)';
  menu.style.borderRadius = 'var(--radius-md)';
  menu.style.boxShadow = 'var(--shadow-lg)';
  menu.style.padding = '6px';
  menu.style.minWidth = '180px';

  const rect = event.target.getBoundingClientRect();
  menu.style.top = `${rect.bottom + window.scrollY + 4}px`;
  menu.style.left = `${Math.max(10, rect.left + window.scrollX - 60)}px`;

  const header = document.createElement('div');
  header.style.padding = '4px 8px';
  header.style.fontSize = '11px';
  header.style.fontWeight = '600';
  header.style.color = 'var(--text-muted)';
  header.textContent = 'Move to column:';
  menu.appendChild(header);

  const otherColumns = (currentBoard.columns || []).filter(col => col.id !== currentColumnId);
  if (otherColumns.length === 0) {
    const emptyNotice = document.createElement('div');
    emptyNotice.style.padding = '6px 10px';
    emptyNotice.style.fontSize = '12px';
    emptyNotice.style.color = 'var(--text-muted)';
    emptyNotice.textContent = 'No other columns available';
    menu.appendChild(emptyNotice);
  } else {
    otherColumns.forEach(col => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'dropdown-item';
      item.textContent = `→ ${col.name}`;
      item.addEventListener('click', async () => {
        menu.remove();
        const pos = col.tasks ? col.tasks.length : 0;
        await executeTaskMove(taskId, col.id, pos);
        showToast(`Moved to ${col.name}`, 'success');
      });
      menu.appendChild(item);
    });
  }

  document.body.appendChild(menu);

  const cleanup = (e) => {
    if (!menu.contains(e.target)) {
      menu.remove();
      document.removeEventListener('click', cleanup);
      document.removeEventListener('keydown', keyCleanup);
    }
  };
  const keyCleanup = (e) => {
    if (e.key === 'Escape') {
      menu.remove();
      document.removeEventListener('click', cleanup);
      document.removeEventListener('keydown', keyCleanup);
    }
  };
  setTimeout(() => {
    document.addEventListener('click', cleanup);
    document.addEventListener('keydown', keyCleanup);
  }, 10);
}

// Filter Matching Logic
function matchFilter(task) {
  const currentUser = Auth.getUser();

  // Search keyword (title or description)
  if (filterState.q) {
    const titleMatch = task.title && task.title.toLowerCase().includes(filterState.q);
    const descMatch = task.description && task.description.toLowerCase().includes(filterState.q);
    if (!titleMatch && !descMatch) return false;
  }

  // Priority filter
  if (filterState.priority !== 'all') {
    if ((task.priority || 'medium').toLowerCase() !== filterState.priority.toLowerCase()) {
      return false;
    }
  }

  // Assignee filter
  if (filterState.assignee !== 'all') {
    if (filterState.assignee === 'me') {
      if (!currentUser || task.assignee_id !== currentUser.id) return false;
    } else if (filterState.assignee === 'unassigned') {
      if (task.assignee_id !== null && task.assignee_id !== undefined) return false;
    } else {
      if (task.assignee_id != filterState.assignee) return false;
    }
  }

  // My tasks quick toggle
  if (filterState.myTasks) {
    if (!currentUser || task.assignee_id !== currentUser.id) return false;
  }

  return true;
}

function applyFilters() {
  const clearBtn = document.getElementById('btn-clear-filters');
  const hasActive = filterState.q || filterState.priority !== 'all' || filterState.assignee !== 'all' || filterState.myTasks;
  if (clearBtn) clearBtn.style.display = hasActive ? 'inline-flex' : 'none';

  renderKanbanColumns();
}

function clearAllFilters() {
  filterState = {
    q: '',
    priority: 'all',
    assignee: 'all',
    myTasks: false
  };

  const qInput = document.getElementById('task-search-input');
  if (qInput) qInput.value = '';

  const pSelect = document.getElementById('filter-priority');
  if (pSelect) pSelect.value = 'all';

  const aSelect = document.getElementById('filter-assignee');
  if (aSelect) aSelect.value = 'all';

  const myTasksBtn = document.getElementById('btn-toggle-my-tasks');
  if (myTasksBtn) myTasksBtn.classList.remove('btn-toggle-active');

  applyFilters();
}

// Task Detail Modal
async function openTaskDetailModal(taskId) {
  currentEditingTaskId = taskId;

  try {
    const data = await API.get(`/api/tasks/${taskId}`);
    const task = data.task;

    document.getElementById('detail-task-id').value = task.id;
    document.getElementById('detail-task-id-badge').textContent = `#${task.id}`;
    document.getElementById('detail-task-column-badge').textContent = task.column_name || 'Column';
    document.getElementById('detail-task-title').value = task.title || '';
    document.getElementById('detail-task-desc').value = task.description || '';
    document.getElementById('detail-task-priority').value = (task.priority || 'medium').toLowerCase();
    document.getElementById('detail-task-due-date').value = task.due_date ? task.due_date.split('T')[0] : '';
    document.getElementById('detail-task-creator').textContent = task.creator_name || 'Anonymous';
    document.getElementById('detail-task-created-at').textContent = new Date(task.created_at).toLocaleDateString();

    // Populate assignee dropdown
    const assigneeSelect = document.getElementById('detail-task-assignee');
    assigneeSelect.innerHTML = '<option value="">Unassigned</option>';
    if (currentBoard && currentBoard.members) {
      currentBoard.members.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m.id;
        opt.textContent = `${m.name} (${m.role})`;
        if (task.assignee_id === m.id) opt.selected = true;
        assigneeSelect.appendChild(opt);
      });
    }

    // Populate column move dropdown
    const colSelect = document.getElementById('detail-task-move-column');
    colSelect.innerHTML = '';
    if (currentBoard && currentBoard.columns) {
      currentBoard.columns.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.id;
        opt.textContent = c.name;
        if (task.column_id === c.id) opt.selected = true;
        colSelect.appendChild(opt);
      });
    }

    // Render Comments
    renderTaskComments(task.comments || []);

    document.getElementById('task-detail-modal').classList.add('open');
  } catch (err) {
    showToast(err.message || 'Failed to open task details.', 'error');
  }
}

function closeTaskDetailModal() {
  document.getElementById('task-detail-modal').classList.remove('open');
  currentEditingTaskId = null;
}

// Render comments list in Task Detail Modal
function renderTaskComments(comments) {
  const container = document.getElementById('detail-comments-list');
  const countEl = document.getElementById('detail-comment-count');
  if (countEl) countEl.textContent = comments.length;

  if (!container) return;
  container.innerHTML = '';

  if (comments.length === 0) {
    container.innerHTML = '<div style="font-size: 12px; color: var(--text-muted); font-style: italic; padding: 8px 0;">No comments yet. Start the conversation!</div>';
    return;
  }

  const currentUser = Auth.getUser();

  comments.forEach(c => {
    const item = document.createElement('div');
    item.className = 'comment-item';
    item.id = `comment-${c.id}`;

    const isAuthor = currentUser && currentUser.id === c.user_id;
    const formattedTime = new Date(c.created_at).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    item.innerHTML = `
      <div class="comment-header">
        <div class="comment-author-info">
          <div class="avatar avatar-sm">${Auth.getInitials(c.author_name)}</div>
          <span class="comment-author">${escapeHtml(c.author_name)}</span>
          <span class="comment-time">${formattedTime}</span>
        </div>
        ${isAuthor ? `
          <button type="button" class="comment-delete-btn" title="Delete your comment">
            ✕ Delete
          </button>
        ` : ''}
      </div>
      <div class="comment-content">${escapeHtml(c.content)}</div>
    `;

    const delCommentBtn = item.querySelector('.comment-delete-btn');
    if (delCommentBtn) {
      delCommentBtn.addEventListener('click', () => handleDeleteComment(c.id));
    }

    container.appendChild(item);
  });
}

// Add Comment
async function handleAddComment(e) {
  e.preventDefault();
  if (!currentEditingTaskId) return;

  const input = document.getElementById('new-comment-input');
  const content = input.value.trim();
  if (!content) return;

  const btn = document.getElementById('btn-post-comment');
  btn.disabled = true;

  try {
    const res = await API.post(`/api/tasks/${currentEditingTaskId}/comments`, { content });
    input.value = '';
    showToast('Comment posted.', 'success');

    // Reload task details to display comment & update comment count on card
    await openTaskDetailModal(currentEditingTaskId);
    await loadBoard();
  } catch (err) {
    showToast(err.message || 'Failed to post comment.', 'error');
  } finally {
    btn.disabled = false;
  }
}

// Delete Comment (Author Only)
async function handleDeleteComment(commentId) {
  try {
    await API.delete(`/api/comments/${commentId}`);
    showToast('Comment deleted.', 'success');
    if (currentEditingTaskId) {
      await openTaskDetailModal(currentEditingTaskId);
      await loadBoard();
    }
  } catch (err) {
    showToast(err.message || 'Failed to delete comment.', 'error');
  }
}

// Save Changes in Task Detail Modal
async function handleSaveTaskChanges(e) {
  e.preventDefault();
  if (!currentEditingTaskId) return;

  const title = document.getElementById('detail-task-title').value.trim();
  const description = document.getElementById('detail-task-desc').value.trim();
  const priority = document.getElementById('detail-task-priority').value;
  const due_date = document.getElementById('detail-task-due-date').value;
  const assignee_id = document.getElementById('detail-task-assignee').value || null;
  const targetColId = Number(document.getElementById('detail-task-move-column').value);

  if (!title) {
    showToast('Task title is required.', 'error');
    return;
  }

  const saveBtn = document.getElementById('btn-save-task-changes');
  saveBtn.disabled = true;

  try {
    // 1. Update task content
    await API.put(`/api/tasks/${currentEditingTaskId}`, {
      title,
      description,
      priority,
      due_date: due_date || null,
      assignee_id
    });

    // 2. If column was changed via dropdown, move task
    const currentTask = findTask(currentEditingTaskId);
    if (currentTask && currentTask.column_id !== targetColId) {
      const targetCol = currentBoard.columns.find(c => c.id === targetColId);
      const pos = targetCol && targetCol.tasks ? targetCol.tasks.length : 0;
      await API.patch(`/api/tasks/${currentEditingTaskId}/move`, {
        column_id: targetColId,
        position: pos
      });
    }

    showToast('Task updated successfully.', 'success');
    closeTaskDetailModal();
    await loadBoard();
  } catch (err) {
    showToast(err.message || 'Failed to update task.', 'error');
  } finally {
    saveBtn.disabled = false;
  }
}

function findTask(taskId) {
  if (!currentBoard) return null;
  for (const col of currentBoard.columns) {
    if (col.tasks) {
      const t = col.tasks.find(item => item.id === taskId);
      if (t) return t;
    }
  }
  return null;
}

// Quick Create Task Modal
function openCreateTaskModal(columnId, columnName) {
  document.getElementById('create-task-column-id').value = columnId;
  document.getElementById('create-task-col-name').textContent = columnName;
  document.getElementById('create-task-title').value = '';
  document.getElementById('create-task-desc').value = '';
  document.getElementById('create-task-priority').value = 'medium';
  document.getElementById('create-task-due-date').value = '';

  const assigneeSelect = document.getElementById('create-task-assignee');
  assigneeSelect.innerHTML = '<option value="">Unassigned</option>';
  if (currentBoard && currentBoard.members) {
    currentBoard.members.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m.id;
      opt.textContent = `${m.name} (${m.role})`;
      assigneeSelect.appendChild(opt);
    });
  }

  document.getElementById('create-task-modal').classList.add('open');
  setTimeout(() => document.getElementById('create-task-title').focus(), 50);
}

function closeCreateTaskModal() {
  document.getElementById('create-task-modal').classList.remove('open');
}

async function handleCreateTask(e) {
  e.preventDefault();
  const columnId = document.getElementById('create-task-column-id').value;
  const title = document.getElementById('create-task-title').value.trim();
  const description = document.getElementById('create-task-desc').value.trim();
  const priority = document.getElementById('create-task-priority').value;
  const due_date = document.getElementById('create-task-due-date').value;
  const assignee_id = document.getElementById('create-task-assignee').value || null;

  if (!title) return;

  const btn = document.getElementById('btn-submit-create-task');
  btn.disabled = true;

  try {
    const res = await API.post(`/api/columns/${columnId}/tasks`, {
      title,
      description,
      priority,
      due_date: due_date || null,
      assignee_id
    });

    showToast(`Task "${res.task.title}" created!`, 'success');
    closeCreateTaskModal();
    await loadBoard();
  } catch (err) {
    showToast(err.message || 'Failed to create task.', 'error');
  } finally {
    btn.disabled = false;
  }
}

// Delete Task Flow
let taskPendingDeleteId = null;
function openDeleteTaskModal(taskId) {
  taskPendingDeleteId = taskId;
  document.getElementById('delete-task-modal').classList.add('open');
}

function closeDeleteTaskModal() {
  document.getElementById('delete-task-modal').classList.remove('open');
  taskPendingDeleteId = null;
}

async function handleConfirmDeleteTask() {
  if (!taskPendingDeleteId) return;

  const btn = document.getElementById('confirm-delete-task-btn');
  btn.disabled = true;

  try {
    await API.delete(`/api/tasks/${taskPendingDeleteId}`);
    showToast('Task deleted successfully.', 'success');
    closeDeleteTaskModal();
    closeTaskDetailModal();
    await loadBoard();
  } catch (err) {
    showToast(err.message || 'Failed to delete task.', 'error');
  } finally {
    btn.disabled = false;
  }
}

// Add Column Flow
function openAddColumnModal() {
  document.getElementById('new-column-name').value = '';
  document.getElementById('add-column-modal').classList.add('open');
  setTimeout(() => document.getElementById('new-column-name').focus(), 50);
}

function closeAddColumnModal() {
  document.getElementById('add-column-modal').classList.remove('open');
}

async function handleAddColumn(e) {
  e.preventDefault();
  const name = document.getElementById('new-column-name').value.trim();
  if (!name) return;

  try {
    await API.post(`/api/boards/${boardId}/columns`, { name });
    showToast(`Column "${name}" added!`, 'success');
    closeAddColumnModal();
    await loadBoard();
  } catch (err) {
    showToast(err.message || 'Failed to add column.', 'error');
  }
}

// Rename Column Flow
function openRenameColumnModal(colId, colName) {
  document.getElementById('rename-column-id').value = colId;
  document.getElementById('rename-column-input').value = colName;
  document.getElementById('rename-column-modal').classList.add('open');
  setTimeout(() => document.getElementById('rename-column-input').focus(), 50);
}

function closeRenameColumnModal() {
  document.getElementById('rename-column-modal').classList.remove('open');
}

async function handleRenameColumn(e) {
  e.preventDefault();
  const colId = document.getElementById('rename-column-id').value;
  const name = document.getElementById('rename-column-input').value.trim();
  if (!name) return;

  try {
    await API.put(`/api/columns/${colId}`, { name });
    showToast('Column renamed.', 'success');
    closeRenameColumnModal();
    await loadBoard();
  } catch (err) {
    showToast(err.message || 'Failed to rename column.', 'error');
  }
}

// Delete Column Flow
let colPendingDeleteId = null;
function openDeleteColumnModal(colId, colName, taskCount) {
  colPendingDeleteId = colId;
  document.getElementById('delete-column-id').value = colId;
  const msg = taskCount > 0 
    ? `Column "<strong>${escapeHtml(colName)}</strong>" contains <strong>${taskCount} task(s)</strong>. Deleting this column will also remove all its tasks. Do you want to proceed?`
    : `Are you sure you want to delete column "<strong>${escapeHtml(colName)}</strong>"?`;
  document.getElementById('delete-column-message').innerHTML = msg;
  document.getElementById('delete-column-modal').classList.add('open');
}

function closeDeleteColumnModal() {
  document.getElementById('delete-column-modal').classList.remove('open');
  colPendingDeleteId = null;
}

async function handleConfirmDeleteColumn() {
  if (!colPendingDeleteId) return;

  const btn = document.getElementById('confirm-delete-column-btn');
  btn.disabled = true;

  try {
    await API.delete(`/api/columns/${colPendingDeleteId}?force=true`);
    showToast('Column deleted.', 'success');
    closeDeleteColumnModal();
    await loadBoard();
  } catch (err) {
    showToast(err.message || 'Failed to delete column.', 'error');
  } finally {
    btn.disabled = false;
  }
}

// Rename Board Flow
function openRenameBoardModal() {
  document.getElementById('rename-board-input').value = currentBoard.name;
  document.getElementById('rename-board-modal').classList.add('open');
  setTimeout(() => document.getElementById('rename-board-input').focus(), 50);
}

function closeRenameBoardModal() {
  document.getElementById('rename-board-modal').classList.remove('open');
}

async function handleRenameBoard(e) {
  e.preventDefault();
  const name = document.getElementById('rename-board-input').value.trim();
  if (!name) return;

  try {
    await API.put(`/api/boards/${boardId}`, { name, description: currentBoard.description });
    showToast('Board renamed.', 'success');
    closeRenameBoardModal();
    await loadBoard();
  } catch (err) {
    showToast(err.message || 'Failed to rename board.', 'error');
  }
}

// Members Management Modal Flow
function openMembersModal() {
  const modal = document.getElementById('members-modal');
  const inviteSection = document.getElementById('invite-member-section');
  const currentUser = Auth.getUser();
  const isOwner = currentBoard.user_role === 'owner' || (currentUser && currentUser.id === currentBoard.owner_id);

  if (inviteSection) {
    inviteSection.style.display = isOwner ? 'block' : 'none';
  }

  renderMembersList();
  modal.classList.add('open');
}

function closeMembersModal() {
  document.getElementById('members-modal').classList.remove('open');
}

function renderMembersList() {
  const container = document.getElementById('modal-members-list');
  if (!container) return;
  container.innerHTML = '';

  const currentUser = Auth.getUser();
  const isOwner = currentBoard.user_role === 'owner' || (currentUser && currentUser.id === currentBoard.owner_id);
  const members = currentBoard.members || [];

  members.forEach(m => {
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.justifyContent = 'space-between';
    row.style.padding = '8px 12px';
    row.style.backgroundColor = 'var(--bg-secondary)';
    row.style.borderRadius = 'var(--radius-md)';
    row.style.border = '1px solid var(--border-subtle)';

    const isMemberOwner = m.role === 'owner';

    row.innerHTML = `
      <div style="display: flex; align-items: center; gap: 10px;">
        <div class="avatar avatar-sm">${Auth.getInitials(m.name)}</div>
        <div>
          <div style="font-weight: 600; font-size: 13px;">${escapeHtml(m.name)}</div>
          <div style="font-size: 11px; color: var(--text-muted);">${escapeHtml(m.email)}</div>
        </div>
      </div>

      <div style="display: flex; align-items: center; gap: 8px;">
        <span class="board-role-badge ${isMemberOwner ? 'owner' : 'member'}">${m.role}</span>
        ${isOwner && !isMemberOwner ? `
          <button type="button" class="btn btn-ghost btn-sm btn-remove-member" style="color: var(--danger); padding: 2px 6px;" title="Remove member">
            ✕ Remove
          </button>
        ` : ''}
      </div>
    `;

    const removeBtn = row.querySelector('.btn-remove-member');
    if (removeBtn) {
      removeBtn.addEventListener('click', () => handleRemoveMember(m.id, m.name));
    }

    container.appendChild(row);
  });
}

async function handleInviteMember(e) {
  e.preventDefault();
  const emailInput = document.getElementById('invite-email-input');
  const email = emailInput.value.trim();
  if (!email) return;

  const btn = document.getElementById('btn-invite-member');
  btn.disabled = true;

  try {
    const res = await API.post(`/api/boards/${boardId}/members`, { email });
    showToast(res.message, 'success');
    emailInput.value = '';
    await loadBoard();
    renderMembersList();
  } catch (err) {
    showToast(err.message || 'Failed to invite user.', 'error');
  } finally {
    btn.disabled = false;
  }
}

async function handleRemoveMember(userId, userName) {
  if (!confirm(`Are you sure you want to remove ${userName} from this board?`)) return;

  try {
    await API.delete(`/api/boards/${boardId}/members/${userId}`);
    showToast(`${userName} removed from board.`, 'success');
    await loadBoard();
    renderMembersList();
  } catch (err) {
    showToast(err.message || 'Failed to remove member.', 'error');
  }
}

// Activity Log Modal Flow
async function openActivityModal() {
  const modal = document.getElementById('activity-modal');
  const container = document.getElementById('activity-log-list');
  container.innerHTML = '<div style="font-size: 13px; color: var(--text-muted);">Loading activity logs...</div>';
  modal.classList.add('open');

  try {
    const res = await API.get(`/api/boards/${boardId}/activity`);
    const logs = res.activities || [];
    container.innerHTML = '';

    if (logs.length === 0) {
      container.innerHTML = '<div style="font-size: 13px; color: var(--text-muted); font-style: italic;">No activities recorded yet.</div>';
      return;
    }

    logs.forEach(log => {
      const item = document.createElement('div');
      item.style.padding = '8px 12px';
      item.style.backgroundColor = 'var(--bg-secondary)';
      item.style.borderRadius = 'var(--radius-md)';
      item.style.border = '1px solid var(--border-subtle)';
      item.style.fontSize = '12px';

      const time = new Date(log.created_at).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });

      item.innerHTML = `
        <div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
          <strong>${escapeHtml(log.user_name)}</strong>
          <span style="color: var(--text-muted); font-size: 11px;">${time}</span>
        </div>
        <div style="color: var(--text-secondary);">${escapeHtml(log.action)}</div>
      `;

      container.appendChild(item);
    });
  } catch (err) {
    container.innerHTML = `<div style="color: var(--danger); font-size: 12px;">Failed to load activity logs: ${escapeHtml(err.message)}</div>`;
  }
}

function closeActivityModal() {
  document.getElementById('activity-modal').classList.remove('open');
}

// Expose functions globally for modal callbacks
window.openCreateTaskModal = openCreateTaskModal;
window.closeCreateTaskModal = closeCreateTaskModal;
window.openTaskDetailModal = openTaskDetailModal;
window.closeTaskDetailModal = closeTaskDetailModal;
window.openAddColumnModal = openAddColumnModal;
window.closeAddColumnModal = closeAddColumnModal;
window.openRenameColumnModal = openRenameColumnModal;
window.closeRenameColumnModal = closeRenameColumnModal;
window.openDeleteColumnModal = openDeleteColumnModal;
window.closeDeleteColumnModal = closeDeleteColumnModal;
window.openRenameBoardModal = openRenameBoardModal;
window.closeRenameBoardModal = closeRenameBoardModal;
window.openMembersModal = openMembersModal;
window.closeMembersModal = closeMembersModal;
window.openActivityModal = openActivityModal;
window.closeActivityModal = closeActivityModal;
window.openDeleteTaskModal = openDeleteTaskModal;
window.closeDeleteTaskModal = closeDeleteTaskModal;
window.handleDeleteComment = handleDeleteComment;
window.handleRemoveMember = handleRemoveMember;
window.openAccessibleMoveMenu = openAccessibleMoveMenu;

async function moveColumn(columnId, targetPosition) {
  try {
    await API.patch(`/api/columns/${columnId}/move`, { position: targetPosition });
    showToast('Column reordered.', 'success');
    await loadBoard();
  } catch (err) {
    showToast(err.message || 'Failed to reorder column.', 'error');
  }
}
window.moveColumn = moveColumn;

