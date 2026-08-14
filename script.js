const SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbx7Y5zaVU7kYTdFwdwhUgoKwqOGx55-8a0McZOmA42PpbU4WWJqYTFPeSH2oD4mOzd7/exec";

let adminPassword =
  sessionStorage.getItem("thebigLeaveAdminPassword") || "";

let currentPage = "dashboard";
let adminRequests = [];
let compRequests = [];
let employeeRows = [];
let ledgerRows = [];
let compLedgerRows = [];
let selectedRequest = null;


function $(id) {
  return document.getElementById(id);
}


function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getRequestValue(row, keys) {
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];

    if (
      row &&
      row[key] !== undefined &&
      row[key] !== null &&
      String(row[key]).trim() !== ""
    ) {
      return row[key];
    }
  }

  return "";
}


function formatRequestDate(value, includeTime) {
  const text = String(value || "").trim();

  if (!text) return "-";

  if (includeTime) {
    return text
      .replace("T", " ")
      .replace(/\.\d{3}Z$/, "")
      .substring(0, 16);
  }

  return text.substring(0, 10);
}


/* Apps Script�� ISO �좎쭨瑜� �쒓뎅 �쒓컙�쇰줈 �쒖떆�⑸땲��. */
function formatKoreanDateTime(value) {
  const text = String(value || "").trim();

  if (!text) return "-";

  const date = new Date(text);

  if (Number.isNaN(date.getTime())) {
    return text
      .replace("T", " ")
      .replace(/\.\d{3}Z$/, "")
      .substring(0, 16);
  }

  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
}


function getCompDateValue(row) {
  return String(row && row["援щ텇"]) === "諛쒖깮"
    ? row["諛쒖깮��"]
    : row["�ъ슜��"];
}


function getDateTimeNumber(value) {
  const time = new Date(value || "").getTime();
  return Number.isNaN(time) ? 0 : time;
}


function setResult(id, message, success) {
  const box = $(id);

  if (!box) return;

  box.textContent = message;
  box.className =
    "result show " + (success ? "success" : "error");
}


function jsonp(params) {
  return new Promise(function (resolve, reject) {
    const callback =
      "cb_" +
      Date.now() +
      "_" +
      Math.floor(Math.random() * 10000);

    const script = document.createElement("script");

    window[callback] = function (data) {
      resolve(data);

      delete window[callback];
      script.remove();
    };

    const query = new URLSearchParams(
      Object.assign({}, params, {
        callback: callback
      })
    );

    script.src =
      SCRIPT_URL + "?" + query.toString();

    script.onerror = function () {
      delete window[callback];
      script.remove();

      reject(
        new Error("�쒕쾭 �곌껐�� �ㅽ뙣�덉뒿�덈떎.")
      );
    };

    document.body.appendChild(script);
  });
}


async function postNoCors(data) {
  await fetch(SCRIPT_URL, {
    method: "POST",
    mode: "no-cors",
    headers: {
      "Content-Type": "text/plain;charset=utf-8"
    },
    body: JSON.stringify(data)
  });
}


function getStatusBadge(status) {
  const value = String(status || "��湲�");

  if (value === "�뱀씤") {
    return `
      <span class="badge badge-approved">
        �뱀씤
      </span>
    `;
  }

  if (value === "諛섎젮") {
    return `
      <span class="badge badge-rejected">
        諛섎젮
      </span>
    `;
  }

  return `
    <span class="badge badge-wait">
      ��湲�
    </span>
  `;
}


function formatEmployeePhone(phone) {
  let number =
    String(phone || "")
      .replace(/[^0-9]/g, "");

  if (
    number.length === 10 &&
    number.startsWith("10")
  ) {
    number = "0" + number;
  }

  if (number.length === 11) {
    return number.replace(
      /(\d{3})(\d{4})(\d{4})/,
      "$1-$2-$3"
    );
  }

  return String(phone || "");
}


document.addEventListener(
  "DOMContentLoaded",
  function () {
    if (adminPassword) {
      showAdminArea();
      openPage("dashboard");
      loadAllAdminData();
    } else {
      $("loginPage").classList.add("active");
    }
  }
);


async function adminLogin() {
  const password =
    $("adminPassword").value.trim();

  if (!password) {
    setResult(
      "adminLoginResult",
      "愿�由ъ옄 鍮꾨�踰덊샇瑜� �낅젰�섏꽭��.",
      false
    );

    return;
  }

  try {
    const result = await jsonp({
      action: "list",
      password: password
    });

    if (!result.ok) {
      throw new Error(
        result.message || "濡쒓렇�� �ㅽ뙣"
      );
    }

    adminPassword = password;

    sessionStorage.setItem(
      "thebigLeaveAdminPassword",
      password
    );

    adminRequests = result.rows || [];

    showAdminArea();
    openPage("dashboard");

    renderAdminRequests();
    updateLeaveDashboard();

    await Promise.all([
      loadCompRequests(),
      loadEmployees(),
      loadLedger()
    ]);

  } catch (error) {
    setResult(
      "adminLoginResult",
      error.message || "愿�由ъ옄 濡쒓렇�� �ㅽ뙣",
      false
    );
  }
}


function showAdminArea() {
  $("loginPage").classList.remove("active");
  $("adminArea").classList.add("show");
}


function openPage(pageName) {
  if (!adminPassword) {
    $("loginPage").classList.add("active");
    return;
  }

  currentPage = pageName;

  document
    .querySelectorAll(".page")
    .forEach(function (page) {
      page.classList.remove("active");
    });

  document
    .querySelectorAll(".tab")
    .forEach(function (tab) {
      tab.classList.remove("active");
    });

  const page =
    $(pageName + "Page");

  if (page) {
    page.classList.add("active");
  }

  const tab =
    document.querySelector(
      '.tab[data-page="' +
      pageName +
      '"]'
    );

  if (tab) {
    tab.classList.add("active");
  }

  if (
    pageName === "dashboard" ||
    pageName === "leave"
  ) {
    loadAdminRequests();
  }

  if (pageName === "comp") {
    loadCompRequests();
  }

  if (pageName === "compLedger") {
  loadCompLedger();
}

  if (pageName === "employees") {
    loadEmployees();
  }

  if (pageName === "ledger") {
    loadLedger();
  }

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}


function loadCurrentPage() {
  openPage(currentPage);
}


async function loadAllAdminData() {
  await Promise.all([
    loadAdminRequests(),
    loadCompRequests(),
    loadEmployees(),
    loadLedger(),
    loadCompLedger()
]);
}


/* =========================
   �곗썡李� �뱀씤愿�由�
========================= */

async function loadAdminRequests() {
  if (!adminPassword) return;

  const body =
    $("adminRequestBody");

  if (body) {
    body.innerHTML = `
      <tr>
        <td colspan="9" class="empty">
          �좎껌�댁뿭�� 遺덈윭�ㅻ뒗 以묒엯�덈떎.
        </td>
      </tr>
    `;
  }

  try {
    const result = await jsonp({
      action: "list",
      password: adminPassword,
      t: Date.now()
    });

    if (!result.ok) {
      throw new Error(
        result.message || "議고쉶 �ㅽ뙣"
      );
    }

    adminRequests =
      result.rows || [];

    renderAdminRequests();
    updateLeaveDashboard();

  } catch (error) {
    if (body) {
      body.innerHTML = `
        <tr>
          <td colspan="9" class="empty">
            ${escapeHtml(error.message)}
          </td>
        </tr>
      `;
    }
  }
}


function getFilteredAdminRequests() {
  const keyword =
    String(
      $("requestKeyword")
        ? $("requestKeyword").value
        : ""
    )
      .trim()
      .toLowerCase();

  const status =
    $("requestStatus")
      ? $("requestStatus").value
      : "��湲�";

  const startDate =
    $("requestStartDate")
      ? $("requestStartDate").value
      : "";

  const endDate =
    $("requestEndDate")
      ? $("requestEndDate").value
      : "";

  return adminRequests.filter(function (row) {
    const id = getRequestValue(row, [
      "ID",
      "�좎껌踰덊샇",
      "id"
    ]);

    const store = getRequestValue(row, [
      "留ㅼ옣",
      "�뚯냽",
      "store"
    ]);

    const name = getRequestValue(row, [
      "�대쫫",
      "吏곸썝紐�",
      "�깅챸",
      "name"
    ]);

    const phone = getRequestValue(row, [
      "�곕씫泥�",
      "�대���",
      "�꾪솕踰덊샇",
      "phone"
    ]);

    const leaveType = getRequestValue(row, [
      "�닿�醫낅쪟",
      "�닿�援щ텇",
      "�곗감援щ텇",
      "leaveType"
    ]);

    const reason = getRequestValue(row, [
      "�ъ쑀",
      "�좎껌�ъ쑀",
      "reason"
    ]);

    const rowStatus = getRequestValue(row, [
      "�곹깭",
      "泥섎━�곹깭",
      "status"
    ]);

    const requestDate = formatRequestDate(
      getRequestValue(row, [
        "�좎껌�쇱떆",
        "�좎껌��",
        "�깅줉�쇱떆",
        "createdAt"
      ]),
      false
    );

    const searchable = [
      id,
      store,
      name,
      phone,
      leaveType,
      reason
    ]
      .join(" ")
      .toLowerCase();

    if (keyword && !searchable.includes(keyword)) {
      return false;
    }

    if (
      status !== "�꾩껜" &&
      String(rowStatus) !== status
    ) {
      return false;
    }

    if (
      startDate &&
      requestDate !== "-" &&
      requestDate < startDate
    ) {
      return false;
    }

    if (
      endDate &&
      requestDate !== "-" &&
      requestDate > endDate
    ) {
      return false;
    }

    return true;
  });
}


function renderAdminRequests() {
  const body = $("adminRequestBody");

  if (!body) return;

  const rows = getFilteredAdminRequests();

  if (!rows.length) {
    body.innerHTML = `
      <tr>
        <td colspan="9" class="empty">
          議곌굔�� 留욌뒗 �좎껌�댁뿭�� �놁뒿�덈떎.
        </td>
      </tr>
    `;
    return;
  }

  body.innerHTML = rows.map(function (row) {
    const id = getRequestValue(row, [
  "�좎껌ID",
  "ID",
  "�좎껌踰덊샇",
  "id"
]);

    const requestDate = getRequestValue(row, [
      "�좎껌�쇱떆",
      "�좎껌��",
      "�깅줉�쇱떆",
      "createdAt"
    ]);

    const store = getRequestValue(row, [
      "留ㅼ옣",
      "�뚯냽",
      "store"
    ]);

    const name = getRequestValue(row, [
      "�대쫫",
      "吏곸썝紐�",
      "�깅챸",
      "name"
    ]);

    const phone = getRequestValue(row, [
      "�곕씫泥�",
      "�대���",
      "�꾪솕踰덊샇",
      "phone"
    ]);

    const leaveType = getRequestValue(row, [
      "�닿�醫낅쪟",
      "�닿�援щ텇",
      "�곗감援щ텇",
      "leaveType"
    ]);

    const startDate = getRequestValue(row, [
      "�쒖옉��",
      "�ъ슜�쒖옉��",
      "startDate"
    ]);

    const endDate = getRequestValue(row, [
      "醫낅즺��",
      "�ъ슜醫낅즺��",
      "endDate"
    ]);

    const days = getRequestValue(row, [
      "�ъ슜�쇱닔",
      "�쇱닔",
      "days"
    ]);

    const reason = getRequestValue(row, [
      "�ъ쑀",
      "�좎껌�ъ쑀",
      "reason"
    ]);

    const status = getRequestValue(row, [
      "�곹깭",
      "泥섎━�곹깭",
      "status"
    ]);

    return `
      <tr>
        <td>
          ${escapeHtml(formatRequestDate(requestDate, true))}
        </td>

        <td>
          ${escapeHtml(store || "-")}
        </td>

        <td>
          ${escapeHtml(name || "-")}
          <br>
          <small>
            ${escapeHtml(formatEmployeePhone(phone))}
          </small>
        </td>

        <td>
          ${escapeHtml(leaveType || "-")}
        </td>

        <td>
          ${escapeHtml(formatRequestDate(startDate, false))}
          ~
          ${escapeHtml(formatRequestDate(endDate, false))}
        </td>

        <td>
          ${escapeHtml(days || "-")}
        </td>

        <td>
          ${escapeHtml(reason || "-")}
        </td>

        <td>
          ${getStatusBadge(status)}
        </td>

        <td>
          <button
            class="btn btn-secondary btn-small"
            onclick="openRequestDetail('${encodeURIComponent(id)}')"
          >
            �곸꽭
          </button>
        </td>
      </tr>
    `;
  }).join("");
}


function resetRequestSearch() {
  $("requestKeyword").value = "";
  $("requestStatus").value = "��湲�";
  $("requestStartDate").value = "";
  $("requestEndDate").value = "";

  renderAdminRequests();
}


function updateLeaveDashboard() {
  const getStatus = function (row) {
    return String(
      getRequestValue(row, [
        "�곹깭",
        "泥섎━�곹깭",
        "status"
      ])
    );
  };

  const total = adminRequests.length;

  const pending = adminRequests.filter(function (row) {
    return getStatus(row) === "��湲�";
  }).length;

  const approved = adminRequests.filter(function (row) {
    return getStatus(row) === "�뱀씤";
  }).length;

  const rejected = adminRequests.filter(function (row) {
    return getStatus(row) === "諛섎젮";
  }).length;

  [
    ["statTotal", total],
    ["statPending", pending],
    ["statApproved", approved],
    ["statRejected", rejected],
    ["adminTotal", total],
    ["adminPending", pending],
    ["adminApproved", approved],
    ["adminRejected", rejected]
  ].forEach(function (item) {
    if ($(item[0])) {
      $(item[0]).textContent = item[1];
    }
  });

  const body = $("dashboardRequestBody");

  if (!body) return;

  const recent = adminRequests.slice(0, 8);

  if (!recent.length) {
    body.innerHTML = `
      <tr>
        <td colspan="7" class="empty">
          �좎껌�댁뿭�� �놁뒿�덈떎.
        </td>
      </tr>
    `;
    return;
  }

  body.innerHTML = recent.map(function (row) {
    const requestDate = getRequestValue(row, [
      "�좎껌�쇱떆",
      "�좎껌��",
      "�깅줉�쇱떆",
      "createdAt"
    ]);

    const store = getRequestValue(row, [
      "留ㅼ옣",
      "�뚯냽",
      "store"
    ]);

    const name = getRequestValue(row, [
      "�대쫫",
      "吏곸썝紐�",
      "�깅챸",
      "name"
    ]);

    const leaveType = getRequestValue(row, [
      "�닿�醫낅쪟",
      "�닿�援щ텇",
      "�곗감援щ텇",
      "leaveType"
    ]);

    const startDate = getRequestValue(row, [
      "�쒖옉��",
      "�ъ슜�쒖옉��",
      "startDate"
    ]);

    const endDate = getRequestValue(row, [
      "醫낅즺��",
      "�ъ슜醫낅즺��",
      "endDate"
    ]);

    const days = getRequestValue(row, [
      "�ъ슜�쇱닔",
      "�쇱닔",
      "days"
    ]);

    const status = getRequestValue(row, [
      "�곹깭",
      "泥섎━�곹깭",
      "status"
    ]);

    return `
      <tr>
        <td>
          ${escapeHtml(formatRequestDate(requestDate, true))}
        </td>

        <td>
          ${escapeHtml(store || "-")}
        </td>

        <td>
          ${escapeHtml(name || "-")}
        </td>

        <td>
          ${escapeHtml(leaveType || "-")}
        </td>

        <td>
          ${escapeHtml(formatRequestDate(startDate, false))}
          ~
          ${escapeHtml(formatRequestDate(endDate, false))}
        </td>

        <td>
          ${escapeHtml(days || "-")}
        </td>

        <td>
          ${getStatusBadge(status)}
        </td>
      </tr>
    `;
  }).join("");
}


function openRequestDetail(encodedId) {
  const id =
    decodeURIComponent(encodedId);

  selectedRequest =
  adminRequests.find(
    function (row) {

      const requestId =
        getRequestValue(row, [
           "�좎껌ID",
          "ID",
          "�좎껌踰덊샇",
          "id"
        ]);

      return (
        String(requestId) ===
        String(id)
      );
    }
  );

  if (!selectedRequest) {
    alert(
      "�좎껌�뺣낫瑜� 李얠쓣 �� �놁뒿�덈떎."
    );

    return;
  }

  const row =
    selectedRequest;

  const requestId = getRequestValue(row, [
  "�좎껌ID",
  "ID",
  "�좎껌踰덊샇",
  "id"
]);

const requestDate = getRequestValue(row, [
  "�좎껌��",
  "�좎껌�쇱떆",
  "�깅줉�쇱떆",
  "createdAt"
]);

const store = getRequestValue(row, [
  "�뚯냽",
  "留ㅼ옣",
  "store"
]);

const name = getRequestValue(row, [
  "吏곸썝紐�",
  "�대쫫",
  "�깅챸",
  "name"
]);

const phone = getRequestValue(row, [
  "�대���",
  "�곕씫泥�",
  "�꾪솕踰덊샇",
  "phone"
]);

const leaveType = getRequestValue(row, [
  "�닿�援щ텇",
  "�닿�醫낅쪟",
  "�곗감援щ텇",
  "leaveType"
]);

const startDate = getRequestValue(row, [
  "�쒖옉��",
  "�ъ슜�쒖옉��",
  "startDate"
]);

const endDate = getRequestValue(row, [
  "醫낅즺��",
  "�ъ슜醫낅즺��",
  "endDate"
]);

const days = getRequestValue(row, [
  "�쇱닔",
  "�ъ슜�쇱닔",
  "days"
]);

const reason = getRequestValue(row, [
  "�ъ쑀",
  "�좎껌�ъ쑀",
  "reason"
]);

const status = getRequestValue(row, [
  "�곹깭",
  "泥섎━�곹깭",
  "status"
]);

const adminMemo = getRequestValue(row, [
  "愿�由ъ옄硫붾え",
  "adminMemo"
]);

const processedAt = getRequestValue(row, [
  "泥섎━��",
  "泥섎━�쇱떆",
  "processedAt"
]);

$("detailContent").innerHTML = `
  <dt>�좎껌踰덊샇</dt>
  <dd>${escapeHtml(requestId || "-")}</dd>

  <dt>�좎껌��</dt>
  <dd>${escapeHtml(requestDate || "-")}</dd>

  <dt>留ㅼ옣</dt>
  <dd>${escapeHtml(store || "-")}</dd>

  <dt>吏곸썝</dt>
  <dd>
    ${escapeHtml(name || "-")}
    /
    ${escapeHtml(formatEmployeePhone(phone))}
  </dd>

  <dt>�닿�醫낅쪟</dt>
  <dd>${escapeHtml(leaveType || "-")}</dd>

  <dt>湲곌컙</dt>
  <dd>
    ${escapeHtml(startDate || "-")}
    ~
    ${escapeHtml(endDate || "-")}
  </dd>

  <dt>�ъ슜�쇱닔</dt>
  <dd>${escapeHtml(days || "-")}��</dd>

  <dt>�ъ쑀</dt>
  <dd>${escapeHtml(reason || "-")}</dd>

  <dt>�곹깭</dt>
  <dd>${getStatusBadge(status)}</dd>

  <dt>愿�由ъ옄硫붾え</dt>
  <dd>${escapeHtml(adminMemo || "-")}</dd>

  <dt>泥섎━�쇱떆</dt>
  <dd>${escapeHtml(processedAt || "-")}</dd>
`;

  const isPending =
  String(status) === "��湲�";

  $("detailAdminActions").innerHTML =
    (
      isPending
        ? `
          <button
            class="btn btn-green"
            onclick="approveRequest()"
          >
            �뱀씤
          </button>

          <button
            class="btn btn-red"
            onclick="rejectRequest()"
          >
            諛섎젮
          </button>
        `
        : ""
    ) +
    `
      <button
        class="btn btn-secondary"
        onclick="closeDetailModal()"
      >
        �リ린
      </button>
    `;

  $("detailModal")
    .classList
    .add("show");
}


function closeDetailModal() {
  $("detailModal")
    .classList
    .remove("show");

  selectedRequest = null;
}


function closeModalByOutside(event) {
  if (
    event.target.id === "detailModal"
  ) {
    closeDetailModal();
  }
}


async function approveRequest() {
  if (!selectedRequest) return;

  if (
    !confirm(
      "�� �좎껌�� �뱀씤�섏떆寃좎뒿�덇퉴?"
    )
  ) {
    return;
  }

  await updateRequestStatus(
    "approve",
    "愿�由ъ옄 �뱀씤"
  );
}


async function rejectRequest() {
  if (!selectedRequest) return;

  const memo =
    prompt(
      "諛섎젮 �ъ쑀瑜� �낅젰�섏꽭��.",
      selectedRequest["愿�由ъ옄硫붾え"] || ""
    );

  if (memo === null) return;

  if (!memo.trim()) {
    alert("諛섎젮 �ъ쑀瑜� �낅젰�섏꽭��.");
    return;
  }

  await updateRequestStatus(
    "reject",
    memo.trim()
  );
}


async function updateRequestStatus(
  action,
  memo
) {
  try {
    await postNoCors({
      action: action,
      id: getRequestValue(selectedRequest, [
  "�좎껌ID",
  "ID",
  "�좎껌踰덊샇",
  "id"
]),
      password: adminPassword,
      adminMemo: memo
    });

    closeDetailModal();

    setTimeout(
      function () {
        loadAdminRequests();
        loadLedger();
      },
      1200
    );

  } catch (error) {
    alert(
      "泥섎━ 以� �ㅻ쪟媛� 諛쒖깮�덉뒿�덈떎."
    );
  }
}


async function refreshSummary() {
  try {
    const result = await jsonp({
      action: "refreshSummary",
      password: adminPassword,
      t: Date.now()
    });

    if (!result.ok) {
      throw new Error(
        result.message || "媛깆떊 �ㅽ뙣"
      );
    }

    alert(
      result.message ||
      "�곗썡李� �먯옣�� 媛깆떊�덉뒿�덈떎."
    );

    loadLedger();

  } catch (error) {
    alert(error.message);
  }
}


/* =========================
   誘명쑕臾� �뱀씤愿�由�
========================= */

async function loadCompRequests() {
  if (!adminPassword) return;

  const body =
    $("compRequestBody");

  if (body) {
    body.innerHTML = `
      <tr>
        <td colspan="9" class="empty">
          誘명쑕臾� �좎껌�댁뿭�� 遺덈윭�ㅻ뒗 以묒엯�덈떎.
        </td>
      </tr>
    `;
  }

  try {
    const result = await jsonp({
      action: "compList",
      password: adminPassword,
      t: Date.now()
    });

    if (!result.ok) {
      throw new Error(
        result.message || "議고쉶 �ㅽ뙣"
      );
    }

    compRequests =
      result.rows || [];

    renderCompRequests();
    updateCompDashboard();

  } catch (error) {
    if (body) {
      body.innerHTML = `
        <tr>
          <td colspan="9" class="empty">
            ${escapeHtml(error.message)}
          </td>
        </tr>
      `;
    }
  }
}


function renderCompRequests() {
  const body =
    $("compRequestBody");

  if (!body) return;

  const keyword =
    String(
      $("compKeyword")
        ? $("compKeyword").value
        : ""
    )
      .trim()
      .toLowerCase();

  const status =
    $("compStatus")
      ? $("compStatus").value
      : "��湲�";

  const rows =
    compRequests.filter(
      function (row) {
        const text = [
          row["留ㅼ옣"],
          row["�대쫫"],
          row["�곕씫泥�"],
          row["援щ텇"],
          row["�ъ쑀"]
        ]
          .join(" ")
          .toLowerCase();

        if (
          keyword &&
          !text.includes(keyword)
        ) {
          return false;
        }

        if (
          status !== "�꾩껜" &&
          String(row["�곹깭"]) !== status
        ) {
          return false;
        }

        return true;
      }
    )
      .slice()
      .sort(function (a, b) {
        const dateDiff =
          getDateTimeNumber(getCompDateValue(b)) -
          getDateTimeNumber(getCompDateValue(a));

        if (dateDiff !== 0) return dateDiff;

        return (
          getDateTimeNumber(b["�깅줉�쇱떆"]) -
          getDateTimeNumber(a["�깅줉�쇱떆"])
        );
      });

  if (!rows.length) {
    body.innerHTML = `
      <tr>
        <td colspan="9" class="empty">
          議곌굔�� 留욌뒗 誘명쑕臾� �좎껌�� �놁뒿�덈떎.
        </td>
      </tr>
    `;

    return;
  }

  body.innerHTML =
    rows
      .map(function (row) {
        const isCreate =
          String(row["援щ텇"]) === "諛쒖깮";

        const dateText =
          getCompDateValue(row);

        const dateLabel =
          isCreate ? "諛쒖깮��" : "�ъ슜��";

        const isPending =
          String(row["�곹깭"]) === "��湲�";

        return `
          <tr>
            <td>
              ${escapeHtml(
                formatKoreanDateTime(
                  row["�깅줉�쇱떆"]
                )
              )}
            </td>

            <td>
              ${escapeHtml(row["援щ텇"])}
            </td>

            <td>
              ${escapeHtml(row["留ㅼ옣"])}
            </td>

            <td>
              ${escapeHtml(row["�대쫫"])}
              <br>
              <small>
                ${escapeHtml(
                  formatEmployeePhone(
                    row["�곕씫泥�"]
                  )
                )}
              </small>
            </td>

            <td>
              <strong>${dateLabel}</strong>
              <br>
              ${escapeHtml(
                formatRequestDate(dateText, false)
              )}
            </td>

            <td>
              ${escapeHtml(row["�쇱닔"])}
            </td>

            <td>
              ${escapeHtml(
                row["�ъ쑀"] || "-"
              )}
            </td>

            <td>
              ${getStatusBadge(row["�곹깭"])}
            </td>

            <td>
              ${
                isPending
                  ? `
                    <button
                      class="btn btn-green btn-small"
                      onclick="processCompRequest('${row.rowNo}','approve')"
                    >
                      �뱀씤
                    </button>

                    <button
                      class="btn btn-red btn-small"
                      onclick="processCompRequest('${row.rowNo}','reject')"
                    >
                      諛섎젮
                    </button>
                  `
                  : "-"
              }
            </td>
          </tr>
        `;
      })
      .join("");
}


function resetCompSearch() {
  $("compKeyword").value = "";
  $("compStatus").value = "��湲�";

  renderCompRequests();
}


function updateCompDashboard() {
  const total =
    compRequests.length;

  const pending =
    compRequests.filter(
      function (row) {
        return String(row["�곹깭"]) === "��湲�";
      }
    ).length;

  const approved =
    compRequests.filter(
      function (row) {
        return String(row["�곹깭"]) === "�뱀씤";
      }
    ).length;

  const rejected =
    compRequests.filter(
      function (row) {
        return String(row["�곹깭"]) === "諛섎젮";
      }
    ).length;

  $("compTotal").textContent = total;
  $("compPending").textContent = pending;
  $("compApproved").textContent = approved;
  $("compRejected").textContent = rejected;
}


async function processCompRequest(
  rowNo,
  processType
) {
  const message =
    processType === "approve"
      ? "�� 誘명쑕臾� �좎껌�� �뱀씤�섏떆寃좎뒿�덇퉴?"
      : "�� 誘명쑕臾� �좎껌�� 諛섎젮�섏떆寃좎뒿�덇퉴?";

  if (!confirm(message)) return;

  try {
    const result = await jsonp({
      action: "compProcess",
      password: adminPassword,
      rowNo: rowNo,
      processType: processType,
      t: Date.now()
    });

    if (!result.ok) {
      throw new Error(
        result.message || "泥섎━ �ㅽ뙣"
      );
    }

    alert(
      result.message ||
      "泥섎━�섏뿀�듬땲��."
    );

    await Promise.all([
      loadCompRequests(),
      loadCompLedger()
    ]);

  } catch (error) {
    alert(
      error.message ||
      "泥섎━ 以� �ㅻ쪟媛� 諛쒖깮�덉뒿�덈떎."
    );
  }
}


/* =========================
   吏곸썝愿�由�
========================= */

async function loadEmployees() {
  if (!adminPassword) return;

  const body =
    $("employeeBody");

  body.innerHTML = `
    <tr>
      <td colspan="7" class="empty">
        吏곸썝紐⑸줉�� 遺덈윭�ㅻ뒗 以묒엯�덈떎.
      </td>
    </tr>
  `;

  try {
    const result = await jsonp({
      action: "employees",
      password: adminPassword,
      t: Date.now()
    });

    if (!result.ok) {
      throw new Error(
        result.message ||
        "吏곸썝紐⑸줉 議고쉶 �ㅽ뙣"
      );
    }

    employeeRows =
      result.rows || [];

    renderEmployees();

  } catch (error) {
    body.innerHTML = `
      <tr>
        <td colspan="7" class="empty">
          ${escapeHtml(error.message)}
        </td>
      </tr>
    `;
  }
}


function renderEmployees() {
  const body = $("employeeBody");

  if (!body) return;

  const keyword =
    String(
      $("employeeKeyword")
        ? $("employeeKeyword").value
        : ""
    )
      .trim()
      .toLowerCase();

  const rows =
    employeeRows.filter(function(row) {

      const store = String(
        row.store ||
        row["洹쇰Т吏�"] ||
        row["留ㅼ옣"] ||
        row["�뚯냽"] ||
        ""
      );

      const name = String(
        row.name ||
        row["�대쫫"] ||
        row["吏곸썝紐�"] ||
        row["�깅챸"] ||
        ""
      );

      const phone = String(
        row.phone ||
        row["�곕씫泥�"] ||
        row["�대���"] ||
        row["�꾪솕踰덊샇"] ||
        ""
      );

      const status = String(
        row.status ||
        row["�곹깭"] ||
        row["�ъ쭅�곹깭"] ||
        ""
      );

      const text = [
        store,
        name,
        phone,
        status
      ]
        .join(" ")
        .toLowerCase();

      return (
        !keyword ||
        text.includes(keyword)
      );
    });

  if (!rows.length) {
    body.innerHTML = `
      <tr>
        <td colspan="7" class="empty">
          寃��� 議곌굔�� 留욌뒗 吏곸썝�� �놁뒿�덈떎.
        </td>
      </tr>
    `;

    return;
  }

  body.innerHTML =
    rows.map(function(row) {

      const store =
        row.store ||
        row["洹쇰Т吏�"] ||
        row["留ㅼ옣"] ||
        row["�뚯냽"] ||
        "";

      const name =
        row.name ||
        row["�대쫫"] ||
        row["吏곸썝紐�"] ||
        row["�깅챸"] ||
        "";

      const phone =
        row.phone ||
        row["�곕씫泥�"] ||
        row["�대���"] ||
        row["�꾪솕踰덊샇"] ||
        "";

      const hireDate =
        row.hireDate ||
        row["�낆궗��"] ||
        "";

      const status =
        row.status ||
        row["�곹깭"] ||
        row["�ъ쭅�곹깭"] ||
        "�ъ쭅";

      const updatedAt =
        row.updatedAt ||
        row["理쒖쥌�섏젙"] ||
        row["�섏젙�쇱떆"] ||
        row["理쒖쥌媛깆떊"] ||
        "";

      const isRetired =
        String(status) === "�댁궗";

      return `
        <tr>

          <td>
            ${escapeHtml(store)}
          </td>

          <td>
            ${escapeHtml(name)}
          </td>

          <td>
            ${escapeHtml(
              formatEmployeePhone(phone)
            )}
          </td>

          <td>
            ${escapeHtml(
              String(hireDate).substring(0, 10)
            )}
          </td>

          <td>
            ${
              isRetired
                ? `
                  <span class="badge badge-rejected">
                    �댁궗
                  </span>
                `
                : `
                  <span class="badge badge-active">
                    ${escapeHtml(status)}
                  </span>
                `
            }
          </td>

          <td>
            ${escapeHtml(updatedAt || "-")}
          </td>

          <td>
            ${
              isRetired
                ? "-"
                : `
                  <button
                    class="btn btn-red btn-small"
                    onclick="retireEmployee(
                      '${encodeURIComponent(store)}',
                      '${encodeURIComponent(name)}',
                      '${encodeURIComponent(phone)}'
                    )"
                  >
                    �댁궗泥섎━
                  </button>
                `
            }
          </td>

        </tr>
      `;
    })
    .join("");
}


async function retireEmployee(
  store,
  name,
  phone
) {
  const decodedStore =
    decodeURIComponent(store);

  const decodedName =
    decodeURIComponent(name);

  const decodedPhone =
    decodeURIComponent(phone);

  if (
    !confirm(
      decodedName +
      " 吏곸썝�� �댁궗 泥섎━�섏떆寃좎뒿�덇퉴?"
    )
  ) {
    return;
  }

  try {
    await postNoCors({
      action: "retireEmployee",
      password: adminPassword,
      store: decodedStore,
      name: decodedName,
      phone: decodedPhone
    });

    setTimeout(
      function () {
        loadEmployees();
        loadLedger();
      },
      1200
    );

  } catch (error) {
    alert(
      "�댁궗 泥섎━ 以� �ㅻ쪟媛� 諛쒖깮�덉뒿�덈떎."
    );
  }
}

async function resetEmployeePin(
  store,
  name,
  phone
) {
  const decodedStore =
    decodeURIComponent(store);

  const decodedName =
    decodeURIComponent(name);

  const decodedPhone =
    decodeURIComponent(phone);

  if (
    !confirm(
      decodedName +
      " 吏곸썝�� PIN�� 1234濡� 珥덇린�뷀븯�쒓쿋�듬땲源�?"
    )
  ) {
    return;
  }

  try {
    const result = await jsonp({
      action: "resetEmployeePin",
      password: adminPassword,
      store: decodedStore,
      name: decodedName,
      phone: decodedPhone,
      t: Date.now()
    });

    if (!result.ok) {
      throw new Error(
        result.message ||
        "PIN 珥덇린�� �ㅽ뙣"
      );
    }

    alert(
      result.message ||
      "PIN�� 1234濡� 珥덇린�붾릺�덉뒿�덈떎."
    );

    loadEmployees();

  } catch (error) {
    alert(
      error.message ||
      "PIN 珥덇린�� 以� �ㅻ쪟媛� 諛쒖깮�덉뒿�덈떎."
    );
  }
}


/* =========================
   �곗썡李� �먯옣
========================= */

async function loadLedger() {
  if (!adminPassword) return;

  const body =
    $("ledgerBody");

  body.innerHTML = `
    <tr>
      <td colspan="11" class="empty">
        �곗썡李� �먯옣�� 遺덈윭�ㅻ뒗 以묒엯�덈떎.
      </td>
    </tr>
  `;

  try {
    const result = await jsonp({
      action: "summary",
      password: adminPassword,
      t: Date.now()
    });

    if (!result.ok) {
      throw new Error(
        result.message ||
        "�먯옣 議고쉶 �ㅽ뙣"
      );
    }

    ledgerRows =
      result.rows || [];

    renderLedger();

  } catch (error) {
    body.innerHTML = `
      <tr>
        <td colspan="11" class="empty">
          ${escapeHtml(error.message)}
        </td>
      </tr>
    `;
  }
}


function renderLedger() {
  const body =
    $("ledgerBody");

  const keyword =
    String(
      $("ledgerKeyword")
        ? $("ledgerKeyword").value
        : ""
    )
      .trim()
      .toLowerCase();

  const status =
    $("ledgerStatus").value;

  const memo =
    $("ledgerMemo").value;

  const rows =
    ledgerRows.filter(
      function (row) {
        const text = [
          row.store,
          row.name,
          row.phone
        ]
          .join(" ")
          .toLowerCase();

        if (
          keyword &&
          !text.includes(keyword)
        ) {
          return false;
        }

        if (
          status !== "�꾩껜" &&
          String(row.status) !== status
        ) {
          return false;
        }

        if (
          memo !== "�꾩껜" &&
          String(row.memo) !== memo
        ) {
          return false;
        }

        return true;
      }
    );

  if (!rows.length) {
    body.innerHTML = `
      <tr>
        <td colspan="11" class="empty">
          議곌굔�� 留욌뒗 �먯옣 �곗씠�곌� �놁뒿�덈떎.
        </td>
      </tr>
    `;

    return;
  }

  body.innerHTML =
    rows
      .map(function (row) {
        return `
          <tr>
            <td>
              ${escapeHtml(row.store)}
            </td>

            <td>
              ${escapeHtml(row.name)}
            </td>

            <td>
              ${escapeHtml(
                formatEmployeePhone(
                  row.phone
                )
              )}
            </td>

            <td>
              ${escapeHtml(row.hireDate)}
            </td>

            <td>
              ${escapeHtml(row.servicePeriod)}
            </td>

            <td>
              ${escapeHtml(row.generated)}
            </td>

            <td>
              ${escapeHtml(row.used)}
            </td>

            <td>
              ${escapeHtml(row.pending)}
            </td>

            <td>
              <strong>
                ${escapeHtml(row.remain)}
              </strong>
            </td>

            <td>
              ${escapeHtml(row.status)}
            </td>

            <td>
              ${escapeHtml(row.memo)}
            </td>
          </tr>
        `;
      })
      .join("");
}


function resetLedgerSearch() {
  $("ledgerKeyword").value = "";
  $("ledgerStatus").value = "�꾩껜";
  $("ledgerMemo").value = "�꾩껜";

  renderLedger();
}
async function loadMyCompHistory() {

  const name =
    $("compName").value.trim();

  const phone =
    $("compPhone").value.trim();

  if(!name || !phone){
    alert("�대쫫怨� �곕씫泥섎� �낅젰�섏꽭��.");
    return;
  }

  try{

    const result =
      await jsonp({
        action:"myCompHistory",
        name:name,
        phone:phone
      });

    if(!result.ok){
      alert(result.message);
      return;
    }

    renderMyCompHistory(result.rows);

  }catch(err){

    alert("誘명쑕臾� �댁뿭�� 遺덈윭�ㅼ� 紐삵뻽�듬땲��.");

  }

}
function renderMyCompHistory(rows){

  const box =
    $("compHistoryList");

  if(!rows.length){

    box.innerHTML=
    `
    <div class="empty">
      �깅줉�� 誘명쑕臾� �댁뿭�� �놁뒿�덈떎.
    </div>
    `;

    return;
  }

  box.innerHTML =
    rows.map(r=>`

<div class="item">

<div class="item-title">

${r.type}

<span class="badge ${r.status=="�뱀씤"?"ok":r.status=="諛섎젮"?"no":"wait"}">

${r.status}

</span>

</div>

<div class="item-meta">

�좎쭨 :
${r.date}

<br>

�쇱닔 :
${r.days}��

<br>

�ъ쑀 :
${r.reason || "-"}

</div>

</div>

`).join("");

}
async function loadCompLedger(){

  const body =
    $("compLedgerBody");

  body.innerHTML=
  `
  <tr>
    <td colspan="10" class="empty">
      誘명쑕臾� �먯옣�� 遺덈윭�ㅻ뒗 以묒엯�덈떎.
    </td>
  </tr>
  `;

  try{

    const result=
      await jsonp({

        action:"compSummary",

        password:adminPassword,

        t:Date.now()

      });

    if(!result.ok){

      throw new Error(result.message);

    }

    compLedgerRows=
      result.rows||[];

    renderCompLedger();

  }catch(err){

    body.innerHTML=
    `
    <tr>

      <td colspan="10" class="empty">

      ${escapeHtml(err.message)}

      </td>

    </tr>
    `;

  }

}



function renderCompLedger(){

  const body=
    $("compLedgerBody");

  const keyword=
    $("compLedgerKeyword")
      .value
      .trim()
      .toLowerCase();

  const rows=
    compLedgerRows.filter(function(r){

      return(
        !keyword ||

        (
          r.store+
          r.name+
          r.phone
        )
        .toLowerCase()
        .includes(keyword)

      );

    });

  if(!rows.length){

    body.innerHTML=
    `
    <tr>

      <td colspan="10" class="empty">

      議고쉶 寃곌낵媛� �놁뒿�덈떎.

      </td>

    </tr>
    `;

    return;

  }

  body.innerHTML=
  rows.map(function(r){

    return`

<tr>

<td>${escapeHtml(r.store)}</td>

<td>${escapeHtml(r.name)}</td>

<td>${escapeHtml(formatEmployeePhone(r.phone))}</td>

<td>${r.approvedCreate}</td>

<td>${r.approvedUse}</td>

<td>${r.waitCreate}</td>

<td>${r.waitUse}</td>

<td><strong>${r.remain}</strong></td>

<td>${escapeHtml(r.lastCreate||"-")}</td>

<td>${escapeHtml(r.lastUse||"-")}</td>

</tr>

`;

  }).join("");

}
async function renderEmployeeBalanceSummary() {

  const box =
    document.getElementById("employeeBalanceSummary");

  const input =
    document.getElementById("employeeKeyword");

  if (!box || !input) return;

  const keyword =
    String(input.value || "")
      .trim()
      .toLowerCase();

  if (!keyword) {
    box.style.display = "none";
    box.innerHTML = "";
    return;
  }

  const matches =
    employeeRows.filter(function(row) {

      const store =
        String(
          row.store ||
          row["洹쇰Т吏�"] ||
          row["留ㅼ옣"] ||
          row["�뚯냽"] ||
          ""
        );

      const name =
        String(
          row.name ||
          row["�대쫫"] ||
          row["吏곸썝紐�"] ||
          row["�깅챸"] ||
          ""
        );

      const phone =
        String(
          row.phone ||
          row["�곕씫泥�"] ||
          row["�대���"] ||
          row["�꾪솕踰덊샇"] ||
          ""
        );

      return (
        [store, name, phone]
          .join(" ")
          .toLowerCase()
          .includes(keyword)
      );
    });

  if (matches.length !== 1) {
    box.style.display = "none";
    box.innerHTML = "";
    return;
  }

  const employee = matches[0];

  const store =
    String(
      employee.store ||
      employee["洹쇰Т吏�"] ||
      employee["留ㅼ옣"] ||
      employee["�뚯냽"] ||
      ""
    );

  const name =
    String(
      employee.name ||
      employee["�대쫫"] ||
      employee["吏곸썝紐�"] ||
      employee["�깅챸"] ||
      ""
    );

  const phone =
    String(
      employee.phone ||
      employee["�곕씫泥�"] ||
      employee["�대���"] ||
      employee["�꾪솕踰덊샇"] ||
      ""
    );

  box.style.display = "block";

  box.innerHTML = `
    <div style="
      padding:20px;
      text-align:center;
      color:#6f7785;
    ">
      �곗썡李⑥� 誘명쑕臾� �꾪솴�� 議고쉶 以묒엯�덈떎.
    </div>
  `;

  try {

    const results =
      await Promise.all([
        jsonp({
          action: "adminBalance",
          password: adminPassword,
          store: store,
          name: name,
          phone: phone,
          t: Date.now()
        }),

        jsonp({
          action: "adminCompBalance",
          password: adminPassword,
          store: store,
          name: name,
          phone: phone,
          t: Date.now()
        })
      ]);

    const leaveResult = results[0];
    const compResult = results[1];

    if (!leaveResult.ok) {
      throw new Error(
        leaveResult.message ||
        "�곗썡李� 議고쉶 �ㅽ뙣"
      );
    }

    if (!compResult.ok) {
      throw new Error(
        compResult.message ||
        "誘명쑕臾� 議고쉶 �ㅽ뙣"
      );
    }

    const leave =
      leaveResult.balance || {};

    box.innerHTML = `
      <div style="
        font-size:20px;
        font-weight:900;
        margin-bottom:5px;
      ">
        ${escapeHtml(name)}
      </div>

      <div style="
        color:#6f7785;
        margin-bottom:18px;
      ">
        ${escapeHtml(store)}
        쨌
        ${escapeHtml(formatEmployeePhone(phone))}
      </div>

      <div style="
        display:grid;
        grid-template-columns:
          repeat(auto-fit,minmax(280px,1fr));
        gap:14px;
      ">

        <div style="
          padding:18px;
          border:1px solid #dce3eb;
          border-radius:16px;
          background:#fff;
        ">

          <div style="
            font-size:17px;
            font-weight:900;
            color:#2f5f9e;
            margin-bottom:12px;
          ">
            �곗썡李� �꾪솴
          </div>

          �낆궗��
          <strong>${escapeHtml(leave.hireDate || "-")}</strong>
          <br><br>

          洹쇱냽湲곌컙
          <strong>
            ${Number(leave.workYears || 0)}��
            ${Number(leave.workMonths || 0)}媛쒖썡
          </strong>
          <br><br>

          諛쒖깮
          <strong>${Number(leave.base || 0)}��</strong>
          <br><br>

          �뱀씤 �ъ슜
          <strong>${Number(leave.used || 0)}��</strong>
          <br><br>

          �뱀씤 ��湲�
          <strong>${Number(leave.pending || 0)}��</strong>
          <br><br>

          <div style="
  font-size:19px;
  color:#178b59;
  font-weight:900;
">
  �꾩옱 �붿뿬
  ${Number(leave.remain || 0)}��
</div>

${
  Number(leave.carryoverRemain || 0) > 0
    ? `
      <div style="
        margin-top:18px;
        padding:14px 16px;
        border:1px solid #f0cf91;
        border-radius:14px;
        background:#fff8e8;
        color:#8a5a16;
        line-height:1.8;
      ">

        <div style="
          font-weight:900;
          font-size:16px;
          margin-bottom:4px;
        ">
          ${escapeHtml(
            leave.carryoverType ||
            "�꾨뀈�� 誘몄궗�� �곗썡李�"
          )}
        </div>

        <div>
          誘몄궗�� �붿뿬
          <strong>
            ${Number(
              leave.carryoverRemain || 0
            )}��
          </strong>
        </div>

        ${
          leave.carryoverExpireDate
            ? `
              <div style="
                font-size:13px;
                color:#80663c;
              ">
                �쒖떆湲고븳:
                ${escapeHtml(
                  leave.carryoverExpireDate
                )}
              </div>
            `
            : ""
        }

      </div>
    `
    : ""
}

        </div>

        <div style="
          padding:18px;
          border:1px solid #dce3eb;
          border-radius:16px;
          background:#fff;
        ">

          <div style="
            font-size:17px;
            font-weight:900;
            color:#d88924;
            margin-bottom:12px;
          ">
            誘명쑕臾� �꾪솴
          </div>

          �뱀씤 諛쒖깮
          <strong>${Number(compResult.earned || 0)}��</strong>
          <br><br>

          �뱀씤 �ъ슜
          <strong>${Number(compResult.used || 0)}��</strong>
          <br><br>

          諛쒖깮 �뱀씤��湲�
          <strong>${Number(compResult.pendingEarned || 0)}��</strong>
          <br><br>

          �ъ슜 �뱀씤��湲�
          <strong>${Number(compResult.pendingUsed || 0)}��</strong>
          <br><br>

          <div style="
            font-size:19px;
            color:#178b59;
            font-weight:900;
          ">
            �꾩옱 �붿뿬 誘명쑕臾�
            ${Number(compResult.balance || 0)}��
          </div>

        </div>

      </div>
    `;

  } catch (error) {

    box.innerHTML = `
      <div style="
        padding:18px;
        color:#a12724;
        background:#fce7e5;
        border-radius:14px;
      ">
        ${escapeHtml(
          error.message ||
          "吏곸썝 �꾪솴 議고쉶 以� �ㅻ쪟媛� 諛쒖깮�덉뒿�덈떎."
        )}
      </div>
    `;
  }
}