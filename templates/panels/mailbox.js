function MailContent({ detail }) {
  const [plain, setPlain] = React.useState(true);
  const rich = detail.rich;
  function nodes(values, path = 'r') {
    return (values || []).map((node, index) => {
      if (typeof node === 'string') return node;
      const key = path + '.' + index;
      if (node.tag === 'img') return null;
      const props = { key };
      if (node.tag === 'a' && node.href) Object.assign(props, { href: node.href, target: '_blank', rel: 'noopener noreferrer', referrerPolicy: 'no-referrer' });
      if (node.span) props.colSpan = node.span;
      return h(node.tag, props, ['br', 'hr'].includes(node.tag) ? undefined : nodes(node.children, key));
    });
  }
  return h('section', { className: 'w-section email-body' },
    rich?.nodes?.length ? h(W.Button, { variant: 'ghost', onClick: () => setPlain(!plain) }, plain ? dt('查看格式正文', 'View formatted text') : dt('查看纯文本', 'View plain text')) : null,
    plain ? h('pre', null, detail.text || dt('（空正文）', '(Empty body)')) : h('div', { className: 'email-rich-body' }, nodes(rich.nodes)),
    detail.truncated || rich?.limited ? h(W.Status, null, dt('正文超过显示上限，部分内容已省略。', 'Some content was omitted because the body exceeds the display limit.')) : null);
}

function MailMessage({ detail, account, folder, selected, busy, run, who, date }) {
  // A request key belongs to this selected message and survives failed attempts.
  const requestId = React.useRef(null);
  const [sessionId, setSessionId] = React.useState('');
  async function openConversation(id) {
    if (typeof emailWorkspace?.openSession !== 'function') return;
    await emailWorkspace.openSession(id);
  }
  function suggest() {
    return run(async valid => {
      if (!requestId.current) requestId.current = crypto.randomUUID();
      const result = await mailboxApi('suggest', { account, folder, uid: selected, requestId: requestId.current });
      if (!valid()) return;
      setSessionId(result.sessionId);
      await openConversation(result.sessionId);
    });
  }
  return h('article', { className: 'email-message', 'aria-label': dt('邮件详情', 'Message details') },
    h('h2', { className: 'w-detail-title' }, detail.subject || dt('（无主题）', '(No subject)')),
    h('div', { className: 'email-envelope' }, h('p', null, dt('发件人：', 'From: ') + who(detail.from)), h('p', null, dt('收件人：', 'To: ') + who(detail.to)), detail.cc?.length ? h('p', null, 'Cc: ' + who(detail.cc)) : null, h('p', { className: 'w-muted' }, date(detail.date))),
    h(MailContent, { detail }),
    detail.attachments?.length ? h('section', { className: 'w-section' }, h('h3', null, dt('附件', 'Attachments')), h('ul', { className: 'email-attachments' }, detail.attachments.map((file, index) => h('li', { key: index },
      h(W.Icon, { name: 'file', size: 22 }), h('div', null, h('strong', null, file.filename || dt('未命名附件', 'Unnamed attachment')), h('p', { className: 'w-muted' }, [typeof file.size === 'number' ? Math.ceil(file.size / 1024) + ' KiB' : '', file.contentType].filter(Boolean).join(' · '))))))) : null,
    h('footer', { className: 'w-detail-footer' },
      h(W.Button, { icon: 'reply', variant: 'primary', disabled: busy, onClick: suggest }, busy ? dt('正在创建会话…', 'Creating conversation…') : dt('生成回复建议', 'Generate reply suggestion')),
      h('p', { className: 'w-muted' }, dt('在 DSH 会话中生成邮件摘要与回复示例。', 'Generate a summary and example reply in a DSH conversation.')),
      sessionId ? h(W.Status, { tone: 'success' }, h('p', null, dt('已创建 DSH 会话。', 'DSH conversation created.')), h(W.Button, { disabled: busy || typeof emailWorkspace?.openSession !== 'function', onClick: () => run(() => openConversation(sessionId)) }, dt('打开会话', 'Open conversation')), h('p', { className: 'w-muted', style: { overflowWrap: 'anywhere' } }, dt('会话 ID：', 'Session ID: ') + sessionId)) : null));
}

const EMAIL_WORKBENCH_CSS = `
.email-workbench>.w-body{display:block}
.email-workbench .dshe-acc-body .dshe-field{align-content:start}
.email-workbench.dshe-settings{display:flex;gap:0;padding:0;color:var(--w-text)}
.email-workbench.dshe-settings[data-main=true]{padding:calc(24px + var(--dsh-frame-top-clearance,0px)) 28px 0 max(28px,var(--dsh-frame-leading-clearance,0px))}
.email-workbench .dshe-section-hidden:not([hidden]){display:flex;flex-direction:column;min-height:0;flex:1}
.email-workbench .dshe-section-hidden[hidden]{display:none!important}
.email-workbench .email-mailbox{display:flex;flex-direction:column;flex:1;min-height:0}
.email-workbench .email-mailbox-columns{display:grid;grid-template-columns:180px minmax(0,1fr);flex:1;min-height:480px}
.email-workbench .email-folder-rail{border-inline-end:1px solid var(--w-border);padding:24px 14px 24px 0;min-width:0}
.email-workbench .email-folder-rail>label{display:grid;gap:6px;font-size:12px;margin-bottom:18px}
.email-workbench .email-folder-rail select{width:100%}
.email-workbench .email-mailbox .w-split{min-height:480px}
.email-workbench .email-search{padding:18px 14px 12px;display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.email-workbench .email-search .w-search{flex-basis:100%;width:100%}
.email-workbench .email-search .email-unread-filter{display:flex;align-items:center;gap:6px;font-size:12px;margin-inline-start:auto;white-space:nowrap}
.email-workbench .email-search .email-unread-filter input{margin:0}
.email-workbench .email-list-note{padding:12px 16px;font-size:12px;color:var(--w-muted)}
.email-workbench .email-unread-dot{display:inline-block;width:6px;height:6px;border-radius:50%;background:var(--w-accent);margin-inline-end:6px;vertical-align:middle}
.email-workbench .email-message{padding:24px;min-width:0}
.email-workbench .email-envelope{font-size:13px;line-height:1.6;overflow-wrap:anywhere;color:var(--w-muted)}
.email-workbench .email-envelope p{margin:4px 0}
.email-workbench .email-body pre{white-space:pre-wrap;overflow-wrap:anywhere;font:14px/1.8 var(--dsh-font-family-content,system-ui,sans-serif);margin:16px 0}
.email-workbench .email-rich-body{font:14px/1.8 var(--dsh-font-family-content,system-ui,sans-serif);overflow-wrap:anywhere;overflow-x:auto;max-width:100%;padding:8px 0}
.email-workbench .email-rich-body table{border-collapse:collapse;max-width:100%}
.email-workbench .email-rich-body td,.email-workbench .email-rich-body th{border:1px solid var(--w-border);padding:8px}
.email-workbench .email-rich-body a{color:var(--w-accent)}
.email-workbench .email-attachments{list-style:none;padding:0;display:grid;gap:12px}
.email-workbench .email-attachments li{display:flex;align-items:center;gap:12px;overflow-wrap:anywhere}
.email-workbench .email-attachments li>div{min-width:0}
.email-workbench .email-attachments p{margin:4px 0;font-size:12px}
.email-workbench .dshe-mail-footer{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:14px}
.email-workbench .email-account-status{display:flex;gap:12px;align-items:center;padding:12px 0}
.email-workbench .email-monitor{margin-bottom:16px}
@container dsh-workbench (max-width:1050px){.email-workbench .email-mailbox-columns{grid-template-columns:minmax(0,1fr)}.email-workbench .email-folder-rail{border-inline-end:0;border-bottom:1px solid var(--w-border);padding:14px 0;display:flex;gap:14px;flex-wrap:wrap}.email-workbench .email-folder-rail>label{margin:0;flex:1 1 200px}}
@container dsh-workbench (max-width:760px){.email-workbench .dshe-acc-body .dshe-grid{grid-template-columns:minmax(0,1fr)}.email-workbench .email-search{padding-inline:0}.email-workbench .email-message{padding:16px}.email-workbench .email-mailbox-columns{min-height:320px}}
@media(max-width:700px){.email-workbench.dshe-settings[data-main=true]{padding:calc(16px + var(--dsh-frame-top-clearance,0px)) 16px 0 max(16px,var(--dsh-frame-leading-clearance,0px))}}
`;
