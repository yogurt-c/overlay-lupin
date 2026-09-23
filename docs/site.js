'use strict';

const repository = 'yogurt-c/overlay-lupin';
const releasePage = `https://github.com/${repository}/releases/latest`;

// Links always work without JavaScript or when the GitHub API is unavailable.
async function loadRelease() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);
  try {
    const response = await fetch(`https://api.github.com/repos/${repository}/releases/latest`, {
      signal: controller.signal,
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (!response.ok) throw new Error('Release unavailable');
    const release = await response.json();
    if (!Array.isArray(release.assets)) throw new Error('Missing assets');
    const downloads = [
      ['download-mac', /\.dmg$/i],
      ['download-win', /\.exe$/i],
    ];
    for (const [id, extension] of downloads) {
      const asset = release.assets.find(item => extension.test(item.name));
      const link = document.getElementById(id);
      const url = asset && new URL(asset.browser_download_url);
      // Only link to this repository's published assets.
      if (url && url.origin === 'https://github.com' && url.pathname.startsWith(`/${repository}/releases/download/`)) {
        link.href = url.href;
        link.dataset.version = typeof release.tag_name === 'string' ? release.tag_name : '';
      } else {
        link.href = releasePage;
        link.querySelector('small').textContent = '릴리스에서 설치 파일 확인';
      }
    }
    document.getElementById('release-status').textContent = `${release.tag_name} · 최신 릴리스 · 무료 다운로드`;
  } catch {
    document.getElementById('release-status').textContent = '다운로드 버튼을 누르면 GitHub 최신 릴리스로 이동해요.';
  } finally {
    clearTimeout(timeout);
  }
}
loadRelease();

const hideDemo = document.getElementById('hide-demo');
hideDemo.addEventListener('click', () => {
  const hidden = document.getElementById('overlay-scene').classList.toggle('is-hidden');
  hideDemo.setAttribute('aria-pressed', String(hidden));
  hideDemo.replaceChildren(document.createTextNode(hidden ? '다시 꺼내기 ' : '슬쩍 숨기기 '));
  const key = document.createElement('kbd');
  key.textContent = hidden ? 'PgUp' : 'PgDn';
  hideDemo.append(key);
});

// Add a Supabase URL and anon key here to share comments between visitors.
// With no config, comments are kept locally so the page remains useful in preview.
const commentsConfig = window.OVERLAY_LUPIN_COMMENTS || {
  url: 'https://osedhkweibdubwccpqeh.supabase.co/rest/v1/',
  anonKey: 'sb_publishable_5zxeux70gYwvKeh03hw3LA_ENLcTu5K'
};
const commentsApiUrl = commentsConfig.url.replace(/\/+$/, '');

// Count button clicks, including fallback links; this does not measure completed downloads.
for (const [id, platform] of [['download-mac', 'mac'], ['download-win', 'windows']]) {
  const link = document.getElementById(id);
  const recordDownload = async event => {
    if (event.type === 'auxclick' && event.button !== 1) return;
    if (!commentsConfig.url || !commentsConfig.anonKey) return;
    try {
      await fetch(`${commentsApiUrl}/download_events`, {
        method: 'POST',
        keepalive: true,
        headers: {
          apikey: commentsConfig.anonKey,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({ platform, version: link.dataset.version || null }),
      });
    } catch {
      // Analytics must never interrupt navigation or produce an unhandled rejection.
    }
  };
  link.addEventListener('click', recordDownload);
  link.addEventListener('auxclick', recordDownload);
}

const commentStoreKey = 'overlay-lupin-anonymous-comments';
const form = document.getElementById('anonymous-comment-form');
const list = document.getElementById('comment-list');
const status = document.getElementById('comment-status');
const pagination = document.getElementById('comment-pagination');
const previousPage = document.getElementById('comment-prev');
const nextPage = document.getElementById('comment-next');
const pageLabel = document.getElementById('comment-page');
const commentPageSize = 10;
let commentPage = 0;
let hasNextPage = false;
let commentRequest = 0;
const safeComments = value => Array.isArray(value) ? value.filter(item => item && typeof item.name === 'string' && typeof item.body === 'string').slice(0, 50) : [];
const localComments = () => safeComments(JSON.parse(localStorage.getItem(commentStoreKey) || '[]'));
const renderComments = comments => {
  list.replaceChildren();
  if (!comments.length) return;
  comments.forEach(comment => {
    const item = document.createElement('article');
    item.className = 'comment-item';
    const name = document.createElement('strong'); name.textContent = comment.name;
    const body = document.createElement('p'); body.textContent = comment.body;
    item.append(name, body);
    list.append(item);
  });
};
const updatePagination = () => {
  pagination.hidden = commentPage === 0 && !hasNextPage;
  previousPage.disabled = commentPage === 0;
  nextPage.disabled = !hasNextPage;
  pageLabel.textContent = `${commentPage + 1} 페이지`;
};
const loadComments = async (requestedPage = 0) => {
  const request = ++commentRequest;
  previousPage.disabled = true;
  nextPage.disabled = true;
  list.setAttribute('aria-busy', 'true');
  const local = !commentsConfig.url || !commentsConfig.anonKey;
  try {
    const offset = requestedPage * commentPageSize;
    let comments;
    if (local) {
      comments = localComments().slice(offset, offset + commentPageSize + 1);
    } else {
      const response = await fetch(`${commentsApiUrl}/comments?select=name,body,created_at&order=created_at.desc&limit=${commentPageSize + 1}&offset=${offset}`, { headers: { apikey: commentsConfig.anonKey, Authorization: `Bearer ${commentsConfig.anonKey}` } });
      if (!response.ok) throw new Error('comments request failed');
      comments = safeComments(await response.json());
    }
    if (request !== commentRequest) return;
    if (!comments.length && requestedPage > 0) return await loadComments(requestedPage - 1);
    commentPage = requestedPage;
    hasNextPage = comments.length > commentPageSize;
    renderComments(comments.slice(0, commentPageSize));
    status.textContent = local ? '미리보기 모드: 이 브라우저에만 저장돼요.' : '';
  } catch {
    if (request === commentRequest) status.textContent = '댓글을 불러오지 못했어요. 잠시 후 다시 시도해주세요.';
  } finally {
    if (request === commentRequest) {
      list.setAttribute('aria-busy', 'false');
      updatePagination();
    }
  }
};
previousPage.addEventListener('click', () => {
  if (!previousPage.disabled) return loadComments(commentPage - 1);
});
nextPage.addEventListener('click', () => {
  if (!nextPage.disabled) return loadComments(commentPage + 1);
});
form.addEventListener('submit', async event => {
  event.preventDefault();
  const button = form.querySelector('button');
  const comment = { name: form.elements.name.value.trim(), body: form.elements.body.value.trim() };
  if (!comment.name || !comment.body) return;
  button.disabled = true;
  try {
    if (commentsConfig.url && commentsConfig.anonKey) {
      const response = await fetch(`${commentsApiUrl}/comments`, { method: 'POST', headers: { apikey: commentsConfig.anonKey, Authorization: `Bearer ${commentsConfig.anonKey}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify(comment) });
      if (!response.ok) throw new Error('comment request failed');
    } else {
      localStorage.setItem(commentStoreKey, JSON.stringify([comment, ...localComments()].slice(0, 50)));
    }
    form.reset();
    status.textContent = '익명으로 남겼어요. 고마워요!';
    await loadComments();
  } catch { status.textContent = '댓글을 저장하지 못했어요. 잠시 후 다시 시도해주세요.'; }
  button.disabled = false;
});
loadComments();
