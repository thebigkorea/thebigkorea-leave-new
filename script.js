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
let employeeBalanceRequestId = 0;


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

  const date = new Date(text);

  if (!Number.isNaN(date.getTime())) {
    if (includeTime) {
      return formatKoreanDateTime(date);
    }

    const parts = new Intl.DateTimeFormat("ko-KR", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(date);

    const dateParts = {};

    parts.forEach(function (part) {
      dateParts[part.type] = part.value;
    });

    return (
      dateParts.year + "-" +
      dateParts.month + "-" +
      dateParts.day
    );
  }

  return text.substring(0, 10);
}


/* Apps Script의 ISO 날짜를 한국 시간으로 표시합니다. */
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
  return String(row && row["구분"]) === "발생"
    ? row["발생일"]
    : row["사용일"];
}


function getDateTimeNumber(value) {
  const time = new Date(value || "").getTime();
  return Number.isNaN(time) ? 0 : time;
}


/* 사용 시작일과 사용일수로 마지막 사용일을 계산합니다. */
function getCompUsePeriod(startValue, daysValue) {
  const startText = formatRequestDate(startValue, false);
  const days = Number(daysValue || 0);

  if (startText === "-" || !days || days <= 1) {
    return startText;
  }

  const parts = startText.split("-").map(Number);

  if (
    parts.length !== 3 ||
    !parts[0] ||
    !parts[1] ||
    !parts[2]
  ) {
    return startText;
  }

  const endDate = new Date(
    Date.UTC(parts[0], parts[1] - 1, parts[2])
  );

  endDate.setUTCDate(
    endDate.getUTCDate() + Math.ceil(days) - 1
  );

  const endText = [
    endDate.getUTCFullYear(),
    String(endDate.getUTCMonth() + 1).padStart(2, "0"),
    String(endDate.getUTCDate()).padStart(2, "0")
  ].join("-");

  return startText + " ~ " + endText;
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
        new Error("서버 연결에 실패했습니다.")
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
  const value = String(status || "대기");

  if (value === "승인") {
    return `
      <span class="badge badge-approved">
        승인
      </span>
    `;
  }

  if (value === "반려") {
    return `
      <span class="badge badge-rejected">
        반려
      </span>
    `;
  }

  return `
    <span class="badge badge-wait">
      대기
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
      "관리자 비밀번호를 입력하세요.",
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
        result.message || "로그인 실패"
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
      error.message || "관리자 로그인 실패",
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
   연월차 승인관리
========================= */

async function loadAdminRequests() {
  if (!adminPassword) return;

  const body =
    $("adminRequestBody");

  if (body) {
    body.innerHTML = `
      <tr>
        <td colspan="9" class="empty">
          신청내역을 불러오는 중입니다.
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
        result.message || "조회 실패"
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
      : "대기";

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
      "신청번호",
      "id"
    ]);

    const store = getRequestValue(row, [
      "매장",
      "소속",
      "store"
    ]);

    const name = getRequestValue(row, [
      "이름",
      "직원명",
      "성명",
      "name"
    ]);

    const phone = getRequestValue(row, [
      "연락처",
      "휴대폰",
      "전화번호",
      "phone"
    ]);

    const leaveType = getRequestValue(row, [
      "휴가종류",
      "휴가구분",
      "연차구분",
      "leaveType"
    ]);

    const reason = getRequestValue(row, [
      "사유",
      "신청사유",
      "reason"
    ]);

    const rowStatus = getRequestValue(row, [
      "상태",
      "처리상태",
      "status"
    ]);

    const requestDate = formatRequestDate(
      getRequestValue(row, [
        "신청일시",
        "신청일",
        "등록일시",
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
      status !== "전체" &&
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
  })
    .slice()
    .sort(function (a, b) {
      const requestDateA = getRequestValue(a, [
        "신청일시",
        "신청일",
        "등록일시",
        "createdAt"
      ]);

      const requestDateB = getRequestValue(b, [
        "신청일시",
        "신청일",
        "등록일시",
        "createdAt"
      ]);

      const requestDiff =
        getDateTimeNumber(requestDateB) -
        getDateTimeNumber(requestDateA);

      if (requestDiff !== 0) return requestDiff;

      const leaveStartA = getRequestValue(a, [
        "시작일",
        "사용시작일",
        "startDate"
      ]);

      const leaveStartB = getRequestValue(b, [
        "시작일",
        "사용시작일",
        "startDate"
      ]);

      return (
        getDateTimeNumber(leaveStartB) -
        getDateTimeNumber(leaveStartA)
      );
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
          조건에 맞는 신청내역이 없습니다.
        </td>
      </tr>
    `;
    return;
  }

  body.innerHTML = rows.map(function (row) {
    const id = getRequestValue(row, [
  "신청ID",
  "ID",
  "신청번호",
  "id"
]);

    const requestDate = getRequestValue(row, [
      "신청일시",
      "신청일",
      "등록일시",
      "createdAt"
    ]);

    const store = getRequestValue(row, [
      "매장",
      "소속",
      "store"
    ]);

    const name = getRequestValue(row, [
      "이름",
      "직원명",
      "성명",
      "name"
    ]);

    const phone = getRequestValue(row, [
      "연락처",
      "휴대폰",
      "전화번호",
      "phone"
    ]);

    const leaveType = getRequestValue(row, [
      "휴가종류",
      "휴가구분",
      "연차구분",
      "leaveType"
    ]);

    const startDate = getRequestValue(row, [
      "시작일",
      "사용시작일",
      "startDate"
    ]);

    const endDate = getRequestValue(row, [
      "종료일",
      "사용종료일",
      "endDate"
    ]);

    const days = getRequestValue(row, [
      "사용일수",
      "일수",
      "days"
    ]);

    const reason = getRequestValue(row, [
      "사유",
      "신청사유",
      "reason"
    ]);

    const status = getRequestValue(row, [
      "상태",
      "처리상태",
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
            상세
          </button>
        </td>
      </tr>
    `;
  }).join("");
}


function resetRequestSearch() {
  $("requestKeyword").value = "";
  $("requestStatus").value = "대기";
  $("requestStartDate").value = "";
  $("requestEndDate").value = "";

  renderAdminRequests();
}


function updateLeaveDashboard() {
  const getStatus = function (row) {
    return String(
      getRequestValue(row, [
        "상태",
        "처리상태",
        "status"
      ])
    );
  };

  const total = adminRequests.length;

  const pending = adminRequests.filter(function (row) {
    return getStatus(row) === "대기";
  }).length;

  const approved = adminRequests.filter(function (row) {
    return getStatus(row) === "승인";
  }).length;

  const rejected = adminRequests.filter(function (row) {
    return getStatus(row) === "반려";
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

  const recent = adminRequests
    .slice()
    .sort(function (a, b) {
      const requestDateA = getRequestValue(a, [
        "신청일시",
        "신청일",
        "등록일시",
        "createdAt"
      ]);

      const requestDateB = getRequestValue(b, [
        "신청일시",
        "신청일",
        "등록일시",
        "createdAt"
      ]);

      const requestDiff =
        getDateTimeNumber(requestDateB) -
        getDateTimeNumber(requestDateA);

      if (requestDiff !== 0) return requestDiff;

      const startDateA = getRequestValue(a, [
        "시작일",
        "사용시작일",
        "startDate"
      ]);

      const startDateB = getRequestValue(b, [
        "시작일",
        "사용시작일",
        "startDate"
      ]);

      return (
        getDateTimeNumber(startDateB) -
        getDateTimeNumber(startDateA)
      );
    })
    .slice(0, 8);

  if (!recent.length) {
    body.innerHTML = `
      <tr>
        <td colspan="7" class="empty">
          신청내역이 없습니다.
        </td>
      </tr>
    `;
    return;
  }

  body.innerHTML = recent.map(function (row) {
    const requestDate = getRequestValue(row, [
      "신청일시",
      "신청일",
      "등록일시",
      "createdAt"
    ]);

    const store = getRequestValue(row, [
      "매장",
      "소속",
      "store"
    ]);

    const name = getRequestValue(row, [
      "이름",
      "직원명",
      "성명",
      "name"
    ]);

    const leaveType = getRequestValue(row, [
      "휴가종류",
      "휴가구분",
      "연차구분",
      "leaveType"
    ]);

    const startDate = getRequestValue(row, [
      "시작일",
      "사용시작일",
      "startDate"
    ]);

    const endDate = getRequestValue(row, [
      "종료일",
      "사용종료일",
      "endDate"
    ]);

    const days = getRequestValue(row, [
      "사용일수",
      "일수",
      "days"
    ]);

    const status = getRequestValue(row, [
      "상태",
      "처리상태",
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
           "신청ID",
          "ID",
          "신청번호",
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
      "신청정보를 찾을 수 없습니다."
    );

    return;
  }

  const row =
    selectedRequest;

  const requestId = getRequestValue(row, [
  "신청ID",
  "ID",
  "신청번호",
  "id"
]);

const requestDate = getRequestValue(row, [
  "신청일",
  "신청일시",
  "등록일시",
  "createdAt"
]);

const store = getRequestValue(row, [
  "소속",
  "매장",
  "store"
]);

const name = getRequestValue(row, [
  "직원명",
  "이름",
  "성명",
  "name"
]);

const phone = getRequestValue(row, [
  "휴대폰",
  "연락처",
  "전화번호",
  "phone"
]);

const leaveType = getRequestValue(row, [
  "휴가구분",
  "휴가종류",
  "연차구분",
  "leaveType"
]);

const startDate = getRequestValue(row, [
  "시작일",
  "사용시작일",
  "startDate"
]);

const endDate = getRequestValue(row, [
  "종료일",
  "사용종료일",
  "endDate"
]);

const days = getRequestValue(row, [
  "일수",
  "사용일수",
  "days"
]);

const reason = getRequestValue(row, [
  "사유",
  "신청사유",
  "reason"
]);

const status = getRequestValue(row, [
  "상태",
  "처리상태",
  "status"
]);

const adminMemo = getRequestValue(row, [
  "관리자메모",
  "adminMemo"
]);

const processedAt = getRequestValue(row, [
  "처리일",
  "처리일시",
  "processedAt"
]);

$("detailContent").innerHTML = `
  <dt>신청번호</dt>
  <dd>${escapeHtml(requestId || "-")}</dd>

  <dt>신청일</dt>
  <dd>${escapeHtml(requestDate || "-")}</dd>

  <dt>매장</dt>
  <dd>${escapeHtml(store || "-")}</dd>

  <dt>직원</dt>
  <dd>
    ${escapeHtml(name || "-")}
    /
    ${escapeHtml(formatEmployeePhone(phone))}
  </dd>

  <dt>휴가종류</dt>
  <dd>${escapeHtml(leaveType || "-")}</dd>

  <dt>기간</dt>
  <dd>
    ${escapeHtml(startDate || "-")}
    ~
    ${escapeHtml(endDate || "-")}
  </dd>

  <dt>사용일수</dt>
  <dd>${escapeHtml(days || "-")}일</dd>

  <dt>사유</dt>
  <dd>${escapeHtml(reason || "-")}</dd>

  <dt>상태</dt>
  <dd>${getStatusBadge(status)}</dd>

  <dt>관리자메모</dt>
  <dd>${escapeHtml(adminMemo || "-")}</dd>

  <dt>처리일시</dt>
  <dd>${escapeHtml(processedAt || "-")}</dd>
`;

  const isPending =
  String(status) === "대기";

  $("detailAdminActions").innerHTML =
    (
      isPending
        ? `
          <button
            class="btn btn-green"
            onclick="approveRequest()"
          >
            승인
          </button>

          <button
            class="btn btn-red"
            onclick="rejectRequest()"
          >
            반려
          </button>
        `
        : ""
    ) +
    `
      <button
        class="btn btn-secondary"
        onclick="closeDetailModal()"
      >
        닫기
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
      "이 신청을 승인하시겠습니까?"
    )
  ) {
    return;
  }

  await updateRequestStatus(
    "approve",
    "관리자 승인"
  );
}


async function rejectRequest() {
  if (!selectedRequest) return;

  const memo =
    prompt(
      "반려 사유를 입력하세요.",
      selectedRequest["관리자메모"] || ""
    );

  if (memo === null) return;

  if (!memo.trim()) {
    alert("반려 사유를 입력하세요.");
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
  "신청ID",
  "ID",
  "신청번호",
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
      "처리 중 오류가 발생했습니다."
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
        result.message || "갱신 실패"
      );
    }

    alert(
      result.message ||
      "연월차 원장을 갱신했습니다."
    );

    loadLedger();

  } catch (error) {
    alert(error.message);
  }
}


/* =========================
   미휴무 승인관리
========================= */

async function loadCompRequests() {
  if (!adminPassword) return;

  const body =
    $("compRequestBody");

  if (body) {
    body.innerHTML = `
      <tr>
        <td colspan="9" class="empty">
          미휴무 신청내역을 불러오는 중입니다.
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
        result.message || "조회 실패"
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
      : "대기";

  const rows =
    compRequests.filter(
      function (row) {
        const text = [
          row["매장"],
          row["이름"],
          row["연락처"],
          row["구분"],
          row["사유"]
        ]
          .join(" ")
          .toLowerCase();

        if (
          keyword &&
          !text.includes(keyword)
        ) {
          return false;
        }

        if (status === "대기") {
          if (String(row["상태"]) !== "대기") {
            return false;
          }
        } else if (status === "반려") {
          if (String(row["상태"]) !== "반려") {
            return false;
          }
        } else if (
          status === "사용" ||
          status === "발생"
        ) {
          if (String(row["구분"]) !== status) {
            return false;
          }
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
          getDateTimeNumber(b["등록일시"]) -
          getDateTimeNumber(a["등록일시"])
        );
      });

  if (!rows.length) {
    body.innerHTML = `
      <tr>
        <td colspan="9" class="empty">
          조건에 맞는 미휴무 신청이 없습니다.
        </td>
      </tr>
    `;

    return;
  }

  body.innerHTML =
    rows
      .map(function (row) {
        const isCreate =
          String(row["구분"]) === "발생";

        const dateText =
          getCompDateValue(row);

        const dateLabel =
          isCreate ? "발생일" : "사용일";

        const displayDateText =
          isCreate
            ? formatRequestDate(dateText, false)
            : getCompUsePeriod(
                dateText,
                row["일수"]
              );

        const isPending =
          String(row["상태"]) === "대기";

        return `
          <tr>
            <td>
              ${escapeHtml(
                formatKoreanDateTime(
                  row["등록일시"]
                )
              )}
            </td>

            <td>
              ${escapeHtml(row["구분"])}
            </td>

            <td>
              ${escapeHtml(row["매장"])}
            </td>

            <td>
              ${escapeHtml(row["이름"])}
              <br>
              <small>
                ${escapeHtml(
                  formatEmployeePhone(
                    row["연락처"]
                  )
                )}
              </small>
            </td>

            <td>
              <strong>${dateLabel}</strong>
              <br>
              ${escapeHtml(displayDateText)}
            </td>

            <td>
              ${escapeHtml(row["일수"])}
            </td>

            <td>
              ${escapeHtml(
                row["사유"] || "-"
              )}
            </td>

            <td>
              ${getStatusBadge(row["상태"])}
            </td>

            <td>
              ${
                isPending
                  ? `
                    <button
                      class="btn btn-green btn-small"
                      onclick="processCompRequest('${row.rowNo}','approve')"
                    >
                      승인
                    </button>

                    <button
                      class="btn btn-red btn-small"
                      onclick="processCompRequest('${row.rowNo}','reject')"
                    >
                      반려
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
  $("compStatus").value = "대기";

  renderCompRequests();
}


function updateCompDashboard() {
  const total =
    compRequests.length;

  const pending =
    compRequests.filter(
      function (row) {
        return String(row["상태"]) === "대기";
      }
    ).length;

  const approved =
    compRequests.filter(
      function (row) {
        return String(row["상태"]) === "승인";
      }
    ).length;

  const rejected =
    compRequests.filter(
      function (row) {
        return String(row["상태"]) === "반려";
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
      ? "이 미휴무 신청을 승인하시겠습니까?"
      : "이 미휴무 신청을 반려하시겠습니까?";

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
        result.message || "처리 실패"
      );
    }

    alert(
      result.message ||
      "처리되었습니다."
    );

    await Promise.all([
      loadCompRequests(),
      loadCompLedger()
    ]);

  } catch (error) {
    alert(
      error.message ||
      "처리 중 오류가 발생했습니다."
    );
  }
}


/* =========================
   직원관리
========================= */

async function loadEmployees() {
  if (!adminPassword) return;

  const body =
    $("employeeBody");

  body.innerHTML = `
    <tr>
      <td colspan="7" class="empty">
        직원목록을 불러오는 중입니다.
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
        "직원목록 조회 실패"
      );
    }

    employeeRows =
      result.rows || [];

    renderEmployees();
    refreshLeaveGrantEmployeeOptions_();

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
        row["근무지"] ||
        row["매장"] ||
        row["소속"] ||
        ""
      );

      const name = String(
        row.name ||
        row["이름"] ||
        row["직원명"] ||
        row["성명"] ||
        ""
      );

      const phone = String(
        row.phone ||
        row["연락처"] ||
        row["휴대폰"] ||
        row["전화번호"] ||
        ""
      );

      const status = String(
        row.status ||
        row["상태"] ||
        row["재직상태"] ||
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
          검색 조건에 맞는 직원이 없습니다.
        </td>
      </tr>
    `;

    return;
  }

  body.innerHTML =
    rows.map(function(row) {

      const store =
        row.store ||
        row["근무지"] ||
        row["매장"] ||
        row["소속"] ||
        "";

      const name =
        row.name ||
        row["이름"] ||
        row["직원명"] ||
        row["성명"] ||
        "";

      const phone =
        row.phone ||
        row["연락처"] ||
        row["휴대폰"] ||
        row["전화번호"] ||
        "";

      const hireDate =
        row.hireDate ||
        row["입사일"] ||
        "";

      const status =
        row.status ||
        row["상태"] ||
        row["재직상태"] ||
        "재직";

      const updatedAt =
        row.updatedAt ||
        row["최종수정"] ||
        row["수정일시"] ||
        row["최종갱신"] ||
        "";

      const isRetired =
        String(status) === "퇴사";

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
                    퇴사
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
                  <div style="
                    display:flex;
                    justify-content:center;
                    flex-wrap:wrap;
                    gap:6px;
                  ">
                    <button
                      class="btn btn-secondary btn-small"
                      onclick="resetEmployeePin(
                        '${encodeURIComponent(store)}',
                        '${encodeURIComponent(name)}',
                        '${encodeURIComponent(phone)}'
                      )"
                    >
                      PIN 초기화
                    </button>

                    <button
                      class="btn btn-red btn-small"
                      onclick="retireEmployee(
                        '${encodeURIComponent(store)}',
                        '${encodeURIComponent(name)}',
                        '${encodeURIComponent(phone)}'
                      )"
                    >
                      퇴사처리
                    </button>
                  </div>
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
      " 직원을 퇴사 처리하시겠습니까?"
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
      "퇴사 처리 중 오류가 발생했습니다."
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
      " 직원의 PIN을 1234로 초기화하시겠습니까?"
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
        "PIN 초기화 실패"
      );
    }

    alert(
      result.message ||
      "PIN이 1234로 초기화되었습니다."
    );

    loadEmployees();

  } catch (error) {
    alert(
      error.message ||
      "PIN 초기화 중 오류가 발생했습니다."
    );
  }
}


/* =========================
   연월차 원장
========================= */

async function loadLedger() {
  if (!adminPassword) return;

  const body =
    $("ledgerBody");

  body.innerHTML = `
    <tr>
      <td colspan="11" class="empty">
        연월차 원장을 불러오는 중입니다.
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
        "원장 조회 실패"
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
          status !== "전체" &&
          String(row.status) !== status
        ) {
          return false;
        }

        if (
          memo !== "전체" &&
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
          조건에 맞는 원장 데이터가 없습니다.
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
  $("ledgerStatus").value = "전체";
  $("ledgerMemo").value = "전체";

  renderLedger();
}
async function loadMyCompHistory() {

  const name =
    $("compName").value.trim();

  const phone =
    $("compPhone").value.trim();

  if(!name || !phone){
    alert("이름과 연락처를 입력하세요.");
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

    alert("미휴무 내역을 불러오지 못했습니다.");

  }

}
function renderMyCompHistory(rows){

  const box =
    $("compHistoryList");

  if(!rows.length){

    box.innerHTML=
    `
    <div class="empty">
      등록된 미휴무 내역이 없습니다.
    </div>
    `;

    return;
  }

  box.innerHTML =
    rows.map(r=>`

<div class="item">

<div class="item-title">

${r.type}

<span class="badge ${r.status=="승인"?"ok":r.status=="반려"?"no":"wait"}">

${r.status}

</span>

</div>

<div class="item-meta">

날짜 :
${r.date}

<br>

일수 :
${r.days}일

<br>

사유 :
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
      미휴무 원장을 불러오는 중입니다.
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

      조회 결과가 없습니다.

      </td>

    </tr>
    `;

    return;

  }

  body.innerHTML=
  rows.map(function(r){

    return`

<tr class="comp-ledger-row" onclick='openCompLedgerDetail(${JSON.stringify(r)})' style="cursor:pointer;">

<td>${escapeHtml(r.store)}</td>

<td><strong style="color:#235a9f;text-decoration:underline;">${escapeHtml(r.name)}</strong></td>

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

  const requestId =
    ++employeeBalanceRequestId;

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
          row["근무지"] ||
          row["매장"] ||
          row["소속"] ||
          ""
        );

      const name =
        String(
          row.name ||
          row["이름"] ||
          row["직원명"] ||
          row["성명"] ||
          ""
        );

      const phone =
        String(
          row.phone ||
          row["연락처"] ||
          row["휴대폰"] ||
          row["전화번호"] ||
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
      employee["근무지"] ||
      employee["매장"] ||
      employee["소속"] ||
      ""
    );

  const name =
    String(
      employee.name ||
      employee["이름"] ||
      employee["직원명"] ||
      employee["성명"] ||
      ""
    );

  const phone =
    String(
      employee.phone ||
      employee["연락처"] ||
      employee["휴대폰"] ||
      employee["전화번호"] ||
      ""
    );

  box.style.display = "block";

  box.innerHTML = `
    <div style="
      padding:20px;
      text-align:center;
      color:#6f7785;
    ">
      연월차와 미휴무 현황을 조회 중입니다.
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

    /* 검색어가 바뀐 뒤 도착한 이전 직원 응답은 표시하지 않습니다. */
    const currentKeyword =
      String(input.value || "")
        .trim()
        .toLowerCase();

    if (
      requestId !== employeeBalanceRequestId ||
      currentKeyword !== keyword
    ) {
      return;
    }

    if (!leaveResult.ok) {
      throw new Error(
        leaveResult.message ||
        "연월차 조회 실패"
      );
    }

    if (!compResult.ok) {
      throw new Error(
        compResult.message ||
        "미휴무 조회 실패"
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
        ·
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
            연월차 현황
          </div>

          입사일
          <strong>${escapeHtml(leave.hireDate || "-")}</strong>
          <br><br>

          근속기간
          <strong>
            ${Number(leave.workYears || 0)}년
            ${Number(leave.workMonths || 0)}개월
          </strong>
          <br><br>

          발생
          <strong>${Number(leave.base || 0)}일</strong>
          <br><br>

          승인 사용
          <strong>${Number(leave.used || 0)}일</strong>
          <br><br>

          승인 대기
          <strong>${Number(leave.pending || 0)}일</strong>
          <br><br>

          <div style="
  font-size:19px;
  color:#178b59;
  font-weight:900;
">
  현재 잔여
  ${Number(leave.remain || 0)}일
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
            "특별휴가"
          )}
        </div>

        <div>
          특별휴가 잔여
          <strong>
            ${Number(
              leave.carryoverRemain || 0
            )}일
          </strong>
        </div>

        ${
          leave.carryoverExpireDate
            ? `
              <div style="
                font-size:13px;
                color:#80663c;
              ">
                사용기한:
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
            미휴무 현황
          </div>

          승인 발생
          <strong>${Number(compResult.earned || 0)}일</strong>
          <br><br>

          승인 사용
          <strong>${Number(compResult.used || 0)}일</strong>
          <br><br>

          발생 승인대기
          <strong>${Number(compResult.pendingEarned || 0)}일</strong>
          <br><br>

          사용 승인대기
          <strong>${Number(compResult.pendingUsed || 0)}일</strong>
          <br><br>

          <div style="
            font-size:19px;
            color:#178b59;
            font-weight:900;
          ">
            현재 잔여 미휴무
            ${Number(compResult.balance || 0)}일
          </div>

        </div>

      </div>
    `;

  } catch (error) {

    if (requestId !== employeeBalanceRequestId) {
      return;
    }

    box.innerHTML = `
      <div style="
        padding:18px;
        color:#a12724;
        background:#fce7e5;
        border-radius:14px;
      ">
        ${escapeHtml(
          error.message ||
          "직원 현황 조회 중 오류가 발생했습니다."
        )}
      </div>
    `;
  }
}


/* =========================================================
   특별휴가 / 배우자 출산휴가 관리자 기능
========================================================= */
function refreshLeaveGrantEmployeeOptions_() {
  const selects = [$("specialEmployeeSelect"), $("spouseEmployeeSelect")].filter(Boolean);
  if (!selects.length) return;
  const active = (employeeRows || []).filter(function(row) {
    return String(row.status || row["상태"] || "재직").trim() !== "퇴사";
  });
  const html = '<option value="">직원을 선택하세요</option>' + active.map(function(row, index) {
    const store = String(row.store || row["근무지"] || row["매장"] || row["소속"] || "");
    const name = String(row.name || row["이름"] || row["직원명"] || row["성명"] || "");
    const phone = String(row.phone || row["연락처"] || row["휴대폰"] || row["전화번호"] || "");
    return '<option value="' + index + '">' + escapeHtml(store + ' · ' + name + ' · ' + formatEmployeePhone(phone)) + '</option>';
  }).join('');
  selects.forEach(function(sel){ sel.innerHTML = html; sel._leaveGrantRows = active; });
}

function fillLeaveGrantEmployee_(selectId, prefix) {
  const sel = $(selectId); if (!sel || sel.value === "") return;
  const row = (sel._leaveGrantRows || [])[Number(sel.value)]; if (!row) return;
  $(prefix + "Store").value = String(row.store || row["근무지"] || row["매장"] || row["소속"] || "");
  $(prefix + "Name").value = String(row.name || row["이름"] || row["직원명"] || row["성명"] || "");
  $(prefix + "Phone").value = String(row.phone || row["연락처"] || row["휴대폰"] || row["전화번호"] || "");
}
function fillSpecialEmployee_(){ fillLeaveGrantEmployee_("specialEmployeeSelect","special"); }
function fillSpouseEmployee_(){ fillLeaveGrantEmployee_("spouseEmployeeSelect","spouse"); }

async function grantSpecialLeaveAdmin_() {
  fillSpecialEmployee_();
  const days = Number($("specialDays").value || 0);
  if (!$("specialName").value || !days) { setResult("specialGrantResult","직원과 부여일수를 입력하세요.",false); return; }
  try {
    const r = await jsonp({action:"grantSpecialLeave",password:adminPassword,store:$("specialStore").value,name:$("specialName").value,phone:$("specialPhone").value,grantDate:$("specialGrantDate").value,days:days,reason:$("specialReason").value,t:Date.now()});
    if (!r.ok) throw new Error(r.message || "특별휴가 부여 실패");
    setResult("specialGrantResult",r.message || "특별휴가를 부여했습니다.",true);
    $("specialDays").value=""; $("specialReason").value=""; loadLedger();
  } catch(e) { setResult("specialGrantResult",e.message || "특별휴가 부여 실패",false); }
}

async function registerSpouseBirthAdmin_() {
  fillSpouseEmployee_();
  if (!$("spouseName").value || !$("spouseBirthDate").value) { setResult("spouseBirthResult","직원과 배우자 출산일을 입력하세요.",false); return; }
  try {
    const r = await jsonp({action:"registerSpouseBirth",password:adminPassword,store:$("spouseStore").value,name:$("spouseName").value,phone:$("spousePhone").value,birthDate:$("spouseBirthDate").value,memo:$("spouseBirthMemo").value,t:Date.now()});
    if (!r.ok) throw new Error(r.message || "배우자 출산 등록 실패");
    setResult("spouseBirthResult",r.message || "배우자 출산휴가 20일이 발생했습니다.",true);
    $("spouseBirthMemo").value=""; loadLedger();
  } catch(e) { setResult("spouseBirthResult",e.message || "배우자 출산 등록 실패",false); }
}



/* =========================================================
   직원 선택목록 / 미휴무 원장 상세보기 보강
========================================================= */
function refreshLeaveGrantEmployeeOptions_() {
  const selects = [$('specialEmployeeSelect'), $('spouseEmployeeSelect')].filter(Boolean);
  if (!selects.length) return;

  const active = (employeeRows || [])
    .filter(function(row) {
      const status = String(row.status || row['상태'] || '재직').trim();
      return status !== '퇴사';
    })
    .sort(function(a, b) {
      const sa = String(a.store || a['매장'] || a['근무지'] || '');
      const sb = String(b.store || b['매장'] || b['근무지'] || '');
      const sc = sa.localeCompare(sb, 'ko');
      if (sc !== 0) return sc;
      return String(a.name || a['이름'] || '').localeCompare(String(b.name || b['이름'] || ''), 'ko');
    });

  const options = ['<option value="">직원을 선택하세요</option>'];
  active.forEach(function(row, index) {
    const store = String(row.store || row['근무지'] || row['매장'] || row['소속'] || '').trim();
    const name = String(row.name || row['이름'] || row['직원명'] || row['성명'] || '').trim();
    const phone = String(row.phone || row['연락처'] || row['휴대폰'] || row['전화번호'] || '').trim();
    if (!name) return;
    options.push(
      '<option value="' + index + '">' +
      escapeHtml((store ? store + ' · ' : '') + name + (phone ? ' · ' + formatEmployeePhone(phone) : '')) +
      '</option>'
    );
  });

  selects.forEach(function(sel) {
    const before = sel.value;
    sel.innerHTML = options.join('');
    sel._leaveGrantRows = active;
    if (before && Number(before) < active.length) sel.value = before;
  });
}

async function openCompLedgerDetail(summaryRow) {
  const modal = $('compLedgerDetailModal');
  const title = $('compLedgerDetailTitle');
  const summary = $('compLedgerDetailSummary');
  const body = $('compLedgerDetailBody');
  if (!modal || !body) return;

  title.textContent = (summaryRow.name || '') + ' 미휴무 사용내역';
  summary.innerHTML =
    '<strong>' + escapeHtml(summaryRow.store || '') + ' · ' + escapeHtml(summaryRow.name || '') + '</strong>' +
    ' &nbsp; 승인발생 ' + Number(summaryRow.approvedCreate || 0) + '일' +
    ' / 승인사용 ' + Number(summaryRow.approvedUse || 0) + '일' +
    ' / 잔여 <strong>' + Number(summaryRow.remain || 0) + '일</strong>';
  body.innerHTML = '<tr><td colspan="6" class="empty">사용내역을 불러오는 중입니다.</td></tr>';
  modal.classList.add('show');

  try {
    const result = await jsonp({ action:'compList', password:adminPassword, t:Date.now() });
    if (!result.ok) throw new Error(result.message || '미휴무 내역 조회 실패');

    const targetPhone = String(summaryRow.phone || '').replace(/[^0-9]/g,'');
    const rows = (result.rows || []).filter(function(r) {
      const rowPhone = String(r['연락처'] || r.phone || '').replace(/[^0-9]/g,'');
      const rowStore = String(r['매장'] || r.store || '').trim();
      const rowName = String(r['이름'] || r.name || '').trim();
      return rowStore === String(summaryRow.store || '').trim() &&
             rowName === String(summaryRow.name || '').trim() &&
             rowPhone === targetPhone;
    }).sort(function(a,b) {
      return getDateTimeNumber(b['등록일시'] || b.registeredAt || b['발생일'] || b['사용일']) -
             getDateTimeNumber(a['등록일시'] || a.registeredAt || a['발생일'] || a['사용일']);
    });

    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="6" class="empty">등록된 미휴무 발생·사용내역이 없습니다.</td></tr>';
      return;
    }

    body.innerHTML = rows.map(function(r) {
      const type = String(r['구분'] || r.type || '-');
      const date = type === '발생' ? (r['발생일'] || r.workDate || '-') : (r['사용일'] || r.useDate || '-');
      const days = Number(r['일수'] || r.days || 0);
      const reason = String(r['사유'] || r.reason || '-');
      const status = String(r['상태'] || r.status || '대기');
      const registered = r['등록일시'] || r.registeredAt || '-';
      return '<tr>' +
        '<td>' + escapeHtml(formatRequestDate(registered, true)) + '</td>' +
        '<td>' + escapeHtml(type) + '</td>' +
        '<td>' + escapeHtml(formatRequestDate(date, false)) + '</td>' +
        '<td>' + days + '일</td>' +
        '<td>' + escapeHtml(reason) + '</td>' +
        '<td>' + getStatusBadge(status) + '</td>' +
      '</tr>';
    }).join('');
  } catch (e) {
    body.innerHTML = '<tr><td colspan="6" class="empty">' + escapeHtml(e.message || '조회 중 오류가 발생했습니다.') + '</td></tr>';
  }
}

function closeCompLedgerDetail() {
  const modal = $('compLedgerDetailModal');
  if (modal) modal.classList.remove('show');
}
function closeCompLedgerDetailByOutside(event) {
  if (event && event.target && event.target.id === 'compLedgerDetailModal') closeCompLedgerDetail();
}
