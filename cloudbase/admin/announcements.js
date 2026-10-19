/* Uses the existing password-gated admin API and escaped table rendering. */
let announcementItems = [];
let announcementEditingId = null;
let announcementDirty = false;
let announcementBusy = false;
function announcementFormData() {
  return {
    title: $("announcementTitle").value.trim(),
    summary: $("announcementSummary").value.trim(),
    body: $("announcementBody").value.trim(),
    audience: $("announcementAudience").value,
    recipientIds:
      $("announcementAudience").value === "selected"
        ? $("announcementRecipients")
            .value.split(/[\s,，]+/)
            .filter(Boolean)
        : [],
    pushEnabled: $("announcementPush").checked,
  };
}
function editAnnouncement(item) {
  announcementEditingId = item?.id || null;
  announcementDirty = false;
  $("announcementTitle").value = item?.title || "";
  $("announcementSummary").value = item?.summary || "";
  $("announcementBody").value = item?.body || "";
  $("announcementAudience").value = item?.audience || "all";
  $("announcementRecipients").value = (item?.recipient_ids || []).join("\n");
  $("announcementPush").checked = Boolean(item?.push_enabled);
  $("announcementAudience").disabled = Boolean(item && item.status !== "draft");
  $("announcementRecipients").disabled = Boolean(
    item && item.status !== "draft",
  );
  $("announcementRecipientsLabel").hidden =
    $("announcementAudience").value !== "selected";
  $("announcementEditorTitle").textContent = item
    ? `编辑公告 · ${announcementStatus(item.status)}`
    : "新建公告";
  $("announcementSave").textContent =
    item?.status === "published" ? "保存修改（不重复推送）" : "保存草稿";
  $("announcementPreview").disabled = item?.status === "retracted";
}
function announcementStatus(status) {
  return (
    { draft: "草稿", published: "已发布", retracted: "已撤回" }[status] ||
    status
  );
}
async function loadAnnouncements() {
  const result = await api("/announcements");
  announcementItems = result.items || [];
  $("announcementList").innerHTML = announcementItems.length
    ? `<table><thead><tr><th>标题</th><th>状态</th><th>接收范围</th><th>更新时间</th><th>操作人</th><th>操作</th></tr></thead><tbody>${announcementItems.map((item) => `<tr><td>${escapeHtml(item.title)}</td><td>${announcementStatus(item.status)}</td><td>${item.audience === "all" ? "全部现有用户" : `指定 ${(item.recipient_ids || []).length} 人`}</td><td>${escapeHtml(formatTime(item.updated_at))}</td><td>${escapeHtml(item.updated_by)}</td><td><button class="button secondary" data-announcement-edit="${item.id}">编辑</button><button class="button secondary" data-announcement-stats="${item.id}">发送结果</button>${item.status === "published" ? `<button class="button secondary" data-announcement-action="remind" data-id="${item.id}">再次提醒</button><button class="button secondary" data-announcement-action="retry" data-id="${item.id}">重试失败</button><button class="button secondary" data-announcement-action="retract" data-id="${item.id}">撤回</button>` : ""}</td></tr>`).join("")}</tbody></table>`
    : '<p class="muted" style="padding:20px">暂无系统公告</p>';
  $("announcementList")
    .querySelectorAll("[data-announcement-edit]")
    .forEach(
      (button) =>
        (button.onclick = () => {
          if (announcementDirty && !confirm("放弃尚未保存的编辑？")) return;
          editAnnouncement(
            announcementItems.find(
              (item) => item.id === button.dataset.announcementEdit,
            ),
          );
          $("announcementTitle").focus();
        }),
    );
  $("announcementList")
    .querySelectorAll("[data-announcement-stats]")
    .forEach(
      (button) =>
        (button.onclick = () =>
          void announcementRun(() =>
            showAnnouncementStats(button.dataset.announcementStats),
          )),
    );
  $("announcementList")
    .querySelectorAll("[data-announcement-action]")
    .forEach(
      (button) =>
        (button.onclick = () =>
          void announcementRun(async () => {
            const action = button.dataset.announcementAction;
            const item = announcementItems.find(
              (value) => value.id === button.dataset.id,
            );
            if (
              !confirm(
                `${{ remind: "向未读用户再次推送", retry: "重试发送失败的推送", retract: "撤回公告" }[action]}「${item.title}」？`,
              )
            )
              return;
            await api(`/announcements/${item.id}/${action}`, {
              method: "POST",
              body: {},
            });
            toast(action === "retract" ? "公告已撤回" : "已加入发送队列");
            await loadAnnouncements();
            await showAnnouncementStats(item.id);
          })),
    );
}
async function showAnnouncementStats(id) {
  const s = await api(`/announcements/${id}/stats`);
  $("announcementStats").textContent =
    `接收用户 ${s.recipients} · 站内已读 ${s.read}\n待发送 ${s.pending} · 发送中 ${s.sending} · FCM 已接受 ${s.accepted} · 跳过 ${s.skipped} · 失败 ${s.failed}\n设备收到 ${s.received} · 已展示 ${s.displayed} · 已打开 ${s.opened}\nFCM 接受不代表设备送达；未上报的设备事件不计为已收到。`;
}
async function announcementRun(work) {
  if (announcementBusy) return;
  announcementBusy = true;
  const buttons = [...$("moduleAnnouncements").querySelectorAll("button")];
  const prior = buttons.map((b) => b.disabled);
  buttons.forEach((b) => (b.disabled = true));
  try {
    await work();
  } catch (error) {
    toast(apiErrorMessage(error), true);
  } finally {
    buttons.forEach((b, i) => (b.disabled = prior[i]));
    announcementBusy = false;
  }
}
$("announcementForm").addEventListener(
  "input",
  () => (announcementDirty = true),
);
$("announcementAudience").onchange = () => {
  $("announcementRecipientsLabel").hidden =
    $("announcementAudience").value !== "selected";
};
$("announcementNew").onclick = () => {
  if (announcementDirty && !confirm("放弃尚未保存的编辑？")) return;
  editAnnouncement(null);
};
$("announcementRefresh").onclick = () =>
  void announcementRun(loadAnnouncements);
$("announcementForm").onsubmit = (event) => {
  event.preventDefault();
  void announcementRun(async () => {
    const saved = await api(
      announcementEditingId
        ? `/announcements/${announcementEditingId}`
        : "/announcements",
      {
        method: announcementEditingId ? "PATCH" : "POST",
        body: announcementFormData(),
      },
    );
    await loadAnnouncements();
    editAnnouncement(saved);
    toast("公告已保存");
  });
};
$("announcementPreview").onclick = () => {
  if (!announcementEditingId || announcementDirty) {
    toast("请先保存当前内容，再预览发布", true);
    return;
  }
  const item = announcementItems.find(
    (value) => value.id === announcementEditingId,
  );
  if (!item) return;
  $("announcementPreviewTitle").textContent = item.title;
  $("announcementPreviewSummary").textContent = item.summary;
  $("announcementPreviewBody").textContent = item.body;
  $("announcementPreviewTarget").textContent =
    `接收范围：${item.audience === "all" ? "全部现有用户" : `${item.recipient_ids.length} 位指定用户`}`;
  $("announcementPreviewPush").textContent = item.push_enabled
    ? "发布时发送安卓 Push（尊重用户通知设置）"
    : "仅发布站内公告";
  $("announcementPublish").hidden = item.status !== "draft";
  $("announcementPreviewDialog").showModal();
};
$("announcementPreviewClose").onclick = () =>
  $("announcementPreviewDialog").close();
$("announcementPublish").onclick = () =>
  void announcementRun(async () => {
    await api(`/announcements/${announcementEditingId}/publish`, {
      method: "POST",
      body: {},
    });
    $("announcementPreviewDialog").close();
    await loadAnnouncements();
    editAnnouncement(
      announcementItems.find((item) => item.id === announcementEditingId),
    );
    toast("公告已发布，Push 按设置进入发送队列");
    await showAnnouncementStats(announcementEditingId);
  });
