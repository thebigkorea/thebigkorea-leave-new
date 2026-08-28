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

  const pendingTotal =
    adminRequests.filter(function (row) {
      return String(
        getRequestValue(row, [
          "상태",
          "처리상태",
          "status"
        ])
      ) === "대기";
    }).length;

  const guide = $("requestApprovalGuide");

  if (guide) {
    if (pendingTotal > 0) {
      guide.className = "approval-guide";
      guide.innerHTML =
        '<div><strong>승인 대기 ' +
        pendingTotal +
        '건이 있습니다.</strong><br>' +
        '노란색 행을 확인한 뒤 오른쪽 <b>승인하기</b> 또는 <b>반려하기</b> 버튼으로 바로 처리하세요. ' +
        '내용을 더 확인하려면 <b>상세보기</b>를 누르세요.</div>';
    } else {
      guide.className = "approval-guide done";
      guide.innerHTML =
        '<div><strong>현재 승인 대기 신청이 없습니다.</strong><br>' +
        '새 신청이 들어오면 이 화면에 노란색 행과 승인 버튼이 표시됩니다.</div>';
    }
  }

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

    const isPending =
      String(status) === "대기";

    return `
      <tr class="${isPending ? "approval-pending-row" : ""}">
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
          <div class="approval-actions">
            ${
              isPending
                ? `
                  <button
                    class="btn btn-small btn-approve-strong"
                    onclick="quickApproveRequest('${encodeURIComponent(id)}')"
                  >
                    ✓ 승인하기
                  </button>

                  <button
                    class="btn btn-small btn-reject-strong"
                    onclick="quickRejectRequest('${encodeURIComponent(id)}')"
                  >
                    반려하기
                  </button>
                `
                : ""
            }

            <button
              class="btn btn-small btn-detail-soft"
              onclick="openRequestDetail('${encodeURIComponent(id)}')"
            >
              상세보기
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join("");
}



function selectRequestByEncodedId_(encodedId) {
  const id = decodeURIComponent(encodedId);

  selectedRequest =
    adminRequests.find(function (row) {
      const requestId =
        getRequestValue(row, [
          "신청ID",
          "ID",
          "신청번호",
          "id"
        ]);

      return String(requestId) === String(id);
    });

  return selectedRequest;
}


async function quickApproveRequest(encodedId) {
  const row = selectRequestByEncodedId_(encodedId);

  if (!row) {
    alert("신청정보를 찾을 수 없습니다.");
    return;
  }

  const name =
    getRequestValue(row, [
      "이름",
      "직원명",
      "성명",
      "name"
    ]) || "직원";

  const leaveType =
    getRequestValue(row, [
      "휴가종류",
      "휴가구분",
      "연차구분",
      "leaveType"
    ]) || "휴가";

  if (!confirm(name + "님의 " + leaveType + " 신청을 승인하시겠습니까?")) {
    selectedRequest = null;
    return;
  }

  await updateRequestStatus(
    "approve",
    "관리자 승인"
  );
}


async function quickRejectRequest(encodedId) {
  const row = selectRequestByEncodedId_(encodedId);

  if (!row) {
    alert("신청정보를 찾을 수 없습니다.");
    return;
  }

  const memo = prompt(
    "반려 사유를 입력하세요.",
    getRequestValue(row, [
      "관리자메모",
      "adminMemo"
    ]) || ""
  );

  if (memo === null) {
    selectedRequest = null;
    return;
  }

  if (!memo.trim()) {
    alert("반려 사유를 입력하세요.");
    selectedRequest = null;
    return;
  }

  await updateRequestStatus(
    "reject",
    memo.trim()
  );
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

  const compPendingTotal =
    compRequests.filter(function (row) {
      return String(row["상태"] || "") === "대기";
    }).length;

  const compGuide = $("compApprovalGuide");

  if (compGuide) {
    if (compPendingTotal > 0) {
      compGuide.className = "approval-guide";
      compGuide.innerHTML =
        '<div><strong>승인 대기 ' +
        compPendingTotal +
        '건이 있습니다.</strong><br>' +
        '노란색 행을 확인한 뒤 오른쪽 <b>승인하기</b> 또는 <b>반려하기</b> 버튼으로 바로 처리하세요.</div>';
    } else {
      compGuide.className = "approval-guide done";
      compGuide.innerHTML =
        '<div><strong>현재 승인 대기 미휴무 신청이 없습니다.</strong><br>' +
        '새 신청이 들어오면 이 화면에 노란색 행과 승인 버튼이 표시됩니다.</div>';
    }
  }

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
          <tr class="${isPending ? "approval-pending-row" : ""}">
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
                    <div class="approval-actions">
                      <button
                        class="btn btn-small btn-approve-strong"
                        onclick="processCompRequest('${row.rowNo}','approve')"
                      >
                        ✓ 승인하기
                      </button>

                      <button
                        class="btn btn-small btn-reject-strong"
                        onclick="processCompRequest('${row.rowNo}','reject')"
                      >
                        반려하기
                      </button>
                    </div>
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
            <button
              type="button"
              title="${escapeHtml(name)} 휴가·미휴무 잔여 보기"
              onclick="showEmployeeBalanceSummary(
                '${encodeURIComponent(store).replace(/'/g, "%27")}',
                '${encodeURIComponent(name).replace(/'/g, "%27")}',
                '${encodeURIComponent(phone).replace(/'/g, "%27")}'
              )"
              style="border:0;background:none;color:#285f9e;font:inherit;font-weight:900;text-decoration:underline;text-underline-offset:4px;cursor:pointer;padding:6px 2px;"
            >
              ${escapeHtml(name)}
            </button>
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
              <button
                type="button"
                onclick='openLeaveLedgerDetail(${JSON.stringify(row)})'
                style="
                  padding:0;
                  border:0;
                  background:transparent;
                  color:#235a9f;
                  font-weight:900;
                  text-decoration:underline;
                  cursor:pointer;
                "
              >
                ${escapeHtml(row.name)}
              </button>
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




/* =========================
   원장 상세 카톡 이미지
========================= */

const ledgerKakaoCanvasCache = {
  leave: null,
  comp: null
};


function cleanLedgerText_(value) {
  return String(value == null ? "" : value)
    .replace(/\s+/g, " ")
    .trim();
}


function getLedgerKakaoData_(type) {
  const isLeave = type === "leave";

  const titleEl = $(
    isLeave
      ? "leaveLedgerDetailTitle"
      : "compLedgerDetailTitle"
  );

  const summaryEl = $(
    isLeave
      ? "leaveLedgerDetailSummary"
      : "compLedgerDetailSummary"
  );

  const body = $(
    isLeave
      ? "leaveLedgerDetailBody"
      : "compLedgerDetailBody"
  );

  const rows = [];

  if (body) {
    body.querySelectorAll("tr").forEach(function (tr) {
      const cells =
        Array.from(
          tr.querySelectorAll("td")
        )
          .map(function (td) {
            return cleanLedgerText_(td.textContent);
          });

      if (
        cells.length &&
        !cells.join(" ").includes("내역이 없습니다") &&
        !cells.join(" ").includes("불러오는 중")
      ) {
        rows.push(cells);
      }
    });
  }

  return {
    type: type,
    title:
      cleanLedgerText_(
        titleEl ? titleEl.textContent : ""
      ),
    summary:
      cleanLedgerText_(
        summaryEl ? summaryEl.textContent : ""
      ),
    rows: rows
  };
}


function wrapCanvasText_(ctx, text, maxWidth) {
  const words =
    String(text || "")
      .split(/\s+/)
      .filter(Boolean);

  if (!words.length) {
    return [""];
  }

  const lines = [];
  let current = "";

  words.forEach(function (word) {
    const test =
      current
        ? current + " " + word
        : word;

    if (
      ctx.measureText(test).width <= maxWidth ||
      !current
    ) {
      current = test;
    } else {
      lines.push(current);
      current = word;
    }
  });

  if (current) {
    lines.push(current);
  }

  return lines;
}



function makeCompLedgerKakaoImageSplit_(data) {
  const rows = (data.rows || []).map(function(cells) {
    return {
      date: cells[2] || "-",
      type: cells[1] || "-",
      days: cells[3] || "-",
      reason: cells[4] || "-",
      status: cells[5] || "-"
    };
  });

  const createRows = rows.filter(function(row) {
    return String(row.type).includes("발생");
  });

  const useRows = rows.filter(function(row) {
    return String(row.type).includes("사용");
  });

  function numberFromDays_(value) {
    const n = parseFloat(String(value || "").replace(/[^0-9.]/g, ""));
    return Number.isFinite(n) ? n : 0;
  }

  function approvedDays_(items) {
    return items.reduce(function(sum, row) {
      return sum + (
        String(row.status).includes("승인")
          ? numberFromDays_(row.days)
          : 0
      );
    }, 0);
  }

  function formatDays_(value) {
    const n = numberFromDays_(value);
    return Number.isInteger(n) ? String(n) : String(n);
  }

  const createApproved = approvedDays_(createRows);
  const useApproved = approvedDays_(useRows);

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  const width = 1080;
  const outer = 40;
  const side = 62;
  const columnGap = 16;
  const contentWidth = width - side * 2;
  const columnWidth = (contentWidth - columnGap) / 2;

  canvas.width = width;

  ctx.font = '700 27px "Pretendard","Noto Sans KR",Arial,sans-serif';
  const summaryLines = wrapCanvasText_(
    ctx,
    data.summary,
    contentWidth
  );

  const panelHeaderH = 62;
  const tableHeaderH = 54;
  const baseRowH = 112;
  const rowGap = 0;

  function rowHeight_(row) {
    ctx.font = '500 18px "Pretendard","Noto Sans KR",Arial,sans-serif';
    const reasonLines = wrapCanvasText_(
      ctx,
      row.reason,
      columnWidth - 36
    );
    return baseRowH + Math.max(0, reasonLines.length - 1) * 25;
  }

  const createHeights = createRows.map(rowHeight_);
  const useHeights = useRows.map(rowHeight_);

  const createPanelH =
    panelHeaderH +
    tableHeaderH +
    createHeights.reduce(function(a, b) { return a + b + rowGap; }, 0);

  const usePanelH =
    panelHeaderH +
    tableHeaderH +
    useHeights.reduce(function(a, b) { return a + b + rowGap; }, 0);

  const topAreaH =
    170 +
    summaryLines.length * 36 +
    28;

  const panelH = Math.max(createPanelH, usePanelH, 430);

  canvas.height =
    Math.max(
      820,
      topAreaH + panelH + 110
    );

  /* 배경 */
  ctx.fillStyle = "#f3f6fa";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  /* 바깥 흰 카드 */
  ctx.fillStyle = "#ffffff";
  roundRectCanvas_(
    ctx,
    30,
    30,
    width - 60,
    canvas.height - 60,
    26
  );
  ctx.fill();

  /* 브랜드 */
  ctx.fillStyle = "#24588f";
  ctx.font = '800 23px "Pretendard","Noto Sans KR",Arial,sans-serif';
  ctx.fillText("더큰코리아", side, 83);

  /* 제목 */
  ctx.fillStyle = "#172033";
  ctx.font = '900 39px "Pretendard","Noto Sans KR",Arial,sans-serif';
  ctx.fillText(
    data.title || "미휴무 상세내역",
    side,
    135
  );

  /* 요약 */
  ctx.fillStyle = "#5f6b7a";
  ctx.font = '700 22px "Pretendard","Noto Sans KR",Arial,sans-serif';

  let y = 177;

  summaryLines.forEach(function(line) {
    ctx.fillText(line, side, y);
    y += 36;
  });

  y += 18;

  function drawPanel_(x, panelY, panelW, title, approvedDays, count, rows, rowHeights, mode) {
    const isCreate = mode === "create";

    /* 패널 외곽 */
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#d8e2ee";
    ctx.lineWidth = 2;
    roundRectCanvas_(
      ctx,
      x,
      panelY,
      panelW,
      panelH,
      16
    );
    ctx.fill();
    ctx.stroke();

    /* 패널 제목 영역 */
    ctx.fillStyle = isCreate ? "#eef5fd" : "#fff1ef";
    roundRectCanvas_(
      ctx,
      x,
      panelY,
      panelW,
      panelHeaderH,
      16
    );
    ctx.fill();

    /* 아래쪽 둥근 모서리 보정 */
    ctx.fillRect(
      x,
      panelY + 30,
      panelW,
      panelHeaderH - 30
    );

    ctx.fillStyle = isCreate ? "#24588f" : "#ad4d46";
    ctx.fillRect(x + 18, panelY + 20, 18, 18);

    ctx.font = '900 20px "Pretendard","Noto Sans KR",Arial,sans-serif';
    ctx.fillText(
      title,
      x + 46,
      panelY + 38
    );

    const badgeText =
      "승인 " +
      formatDays_(approvedDays) +
      "일 · " +
      count +
      "건";

    ctx.font = '800 16px "Pretendard","Noto Sans KR",Arial,sans-serif';
    const badgeW = Math.max(
      116,
      ctx.measureText(badgeText).width + 24
    );

    ctx.fillStyle = "rgba(255,255,255,.92)";
    roundRectCanvas_(
      ctx,
      x + panelW - badgeW - 16,
      panelY + 14,
      badgeW,
      34,
      17
    );
    ctx.fill();

    ctx.fillStyle = isCreate ? "#24588f" : "#ad4d46";
    ctx.textAlign = "center";
    ctx.fillText(
      badgeText,
      x + panelW - badgeW / 2 - 16,
      panelY + 37
    );
    ctx.textAlign = "left";

    /* 표 헤더 */
    const headY = panelY + panelHeaderH;
    ctx.fillStyle = isCreate ? "#447caf" : "#b65e58";
    ctx.fillRect(
      x,
      headY,
      panelW,
      tableHeaderH
    );

    ctx.fillStyle = "#ffffff";
    ctx.font = '800 15px "Pretendard","Noto Sans KR",Arial,sans-serif';
    ctx.textAlign = "center";

    const colDate = x + 78;
    const colDays = x + 184;
    const colReason = x + 323;
    const colStatus = x + panelW - 48;

    ctx.fillText(
      isCreate ? "발생일" : "사용일",
      colDate,
      headY + 34
    );
    ctx.fillText("일수", colDays, headY + 34);
    ctx.fillText("사유", colReason, headY + 34);
    ctx.fillText("상태", colStatus, headY + 34);
    ctx.textAlign = "left";

    let rowY = headY + tableHeaderH;

    if (!rows.length) {
      ctx.fillStyle = "#7c8796";
      ctx.font = '600 18px "Pretendard","Noto Sans KR",Arial,sans-serif';
      ctx.textAlign = "center";
      ctx.fillText(
        isCreate ? "미휴무 발생내역이 없습니다." : "미휴무 사용내역이 없습니다.",
        x + panelW / 2,
        rowY + 54
      );
      ctx.textAlign = "left";
      return;
    }

    rows.forEach(function(row, index) {
      const h = rowHeights[index];

      ctx.fillStyle =
        index % 2 === 0
          ? "#ffffff"
          : "#f8fafc";
      ctx.fillRect(x, rowY, panelW, h);

      ctx.strokeStyle = "#e6ebf1";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, rowY + h);
      ctx.lineTo(x + panelW, rowY + h);
      ctx.stroke();

      /* 날짜 */
      ctx.fillStyle = "#172033";
      ctx.font = '700 16px "Pretendard","Noto Sans KR",Arial,sans-serif';
      ctx.textAlign = "center";

      const dateLines = wrapCanvasText_(
        ctx,
        row.date,
        126
      ).slice(0, 2);

      dateLines.forEach(function(line, i) {
        ctx.fillText(
          line,
          colDate,
          rowY + 31 + i * 22
        );
      });

      /* 일수 */
      ctx.font = '900 17px "Pretendard","Noto Sans KR",Arial,sans-serif';
      ctx.fillText(
        row.days,
        colDays,
        rowY + 35
      );

      /* 사유 */
      ctx.textAlign = "left";
      ctx.fillStyle = "#25344a";
      ctx.font = '600 16px "Pretendard","Noto Sans KR",Arial,sans-serif';

      const reasonLines = wrapCanvasText_(
        ctx,
        row.reason,
        190
      ).slice(0, 3);

      reasonLines.forEach(function(line, i) {
        ctx.fillText(
          line,
          x + 222,
          rowY + 31 + i * 23
        );
      });

      /* 상태 */
      const statusText = row.status || "-";
      const approved = statusText.includes("승인");

      ctx.fillStyle =
        approved
          ? "#e2f5ea"
          : statusText.includes("반려")
            ? "#fde7e5"
            : "#fff0c9";

      roundRectCanvas_(
        ctx,
        x + panelW - 88,
        rowY + 20,
        72,
        32,
        16
      );
      ctx.fill();

      ctx.fillStyle =
        approved
          ? "#16734b"
          : statusText.includes("반려")
            ? "#aa2d27"
            : "#8a5a00";

      ctx.font = '800 15px "Pretendard","Noto Sans KR",Arial,sans-serif';
      ctx.textAlign = "center";
      ctx.fillText(
        statusText,
        x + panelW - 52,
        rowY + 42
      );
      ctx.textAlign = "left";

      rowY += h;
    });
  }

  const panelY = y;

  drawPanel_(
    side,
    panelY,
    columnWidth,
    "미휴무 발생내역",
    createApproved,
    createRows.length,
    createRows,
    createHeights,
    "create"
  );

  drawPanel_(
    side + columnWidth + columnGap,
    panelY,
    columnWidth,
    "미휴무 사용내역",
    useApproved,
    useRows.length,
    useRows,
    useHeights,
    "use"
  );

  /* 하단 */
  ctx.fillStyle = "#8793a2";
  ctx.font = '500 18px "Pretendard","Noto Sans KR",Arial,sans-serif';
  ctx.fillText(
    "더큰코리아 인사관리 · 조회 시점 기준",
    side,
    canvas.height - 58
  );

  ledgerKakaoCanvasCache.comp = canvas;

  const image = $("compKakaoPreviewImg");
  const wrap = $("compKakaoPreviewWrap");

  if (image) {
    image.src = canvas.toDataURL("image/png");
  }

  if (wrap) {
    wrap.classList.remove("hidden");
  }

  /* 생성 후 바로 클립보드 복사 시도 */
  copyLedgerKakaoImage("comp", true);
}


function makeLedgerKakaoImage(type) {
  const data =
    getLedgerKakaoData_(type);

  if (!data.rows.length) {
    alert("이미지로 만들 사용내역이 없습니다.");
    return;
  }

  const isLeave =
    type === "leave";

  /* 미휴무는 관리자 화면과 동일하게 발생/사용 2열 이미지로 생성 */
  if (!isLeave) {
    makeCompLedgerKakaoImageSplit_(data);
    return;
  }

  const canvas =
    document.createElement("canvas");

  const ctx =
    canvas.getContext("2d");

  const width = 1080;
  const side = 64;
  const top = 64;
  const rowGap = 18;

  canvas.width = width;

  ctx.font =
    '700 28px "Pretendard","Noto Sans KR",Arial,sans-serif';

  const summaryLines =
    wrapCanvasText_(
      ctx,
      data.summary,
      width - side * 2
    );

  const normalizedRows =
    data.rows.map(function (cells) {
      if (isLeave) {
        return {
          date: cells[0] || "-",
          type: cells[1] || "-",
          days: cells[2] || "-",
          reason: cells[3] || "-",
          status: cells[4] || "-"
        };
      }

      return {
        date: cells[2] || "-",
        type: cells[1] || "-",
        days: cells[3] || "-",
        reason: cells[4] || "-",
        status: cells[5] || "-"
      };
    });

  ctx.font =
    '500 25px "Pretendard","Noto Sans KR",Arial,sans-serif';

  let calculatedHeight =
    top +
    76 +
    summaryLines.length * 38 +
    54;

  normalizedRows.forEach(function (row) {
    const reasonLines =
      wrapCanvasText_(
        ctx,
        row.reason,
        width - side * 2 - 38
      );

    calculatedHeight +=
      108 +
      Math.max(
        0,
        reasonLines.length - 1
      ) * 32 +
      rowGap;
  });

  calculatedHeight += 76;

  canvas.height =
    Math.max(
      720,
      calculatedHeight
    );

  /* 배경 */
  ctx.fillStyle = "#f3f6fa";
  ctx.fillRect(
    0,
    0,
    canvas.width,
    canvas.height
  );

  /* 상단 카드 */
  ctx.fillStyle = "#ffffff";
  roundRectCanvas_(
    ctx,
    34,
    34,
    width - 68,
    canvas.height - 68,
    28
  );
  ctx.fill();

  /* 타이틀 */
  ctx.fillStyle = "#24588f";
  ctx.font =
    '800 24px "Pretendard","Noto Sans KR",Arial,sans-serif';
  ctx.fillText(
    "더큰코리아",
    side,
    92
  );

  ctx.fillStyle = "#172033";
  ctx.font =
    '900 42px "Pretendard","Noto Sans KR",Arial,sans-serif';
  ctx.fillText(
    data.title ||
      (
        isLeave
          ? "연월차 사용내역"
          : "미휴무 사용내역"
      ),
    side,
    148
  );

  /* 요약 */
  ctx.fillStyle = "#5f6b7a";
  ctx.font =
    '600 25px "Pretendard","Noto Sans KR",Arial,sans-serif';

  let y = 198;

  summaryLines.forEach(function (line) {
    ctx.fillText(
      line,
      side,
      y
    );
    y += 38;
  });

  y += 18;

  /* 안내 라벨 */
  ctx.fillStyle = "#eaf2fb";
  roundRectCanvas_(
    ctx,
    side,
    y,
    width - side * 2,
    54,
    14
  );
  ctx.fill();

  ctx.fillStyle = "#24588f";
  ctx.font =
    '800 23px "Pretendard","Noto Sans KR",Arial,sans-serif';
  ctx.fillText(
    isLeave
      ? "날짜별 연월차 사용내역"
      : "날짜별 미휴무 발생·사용내역",
    side + 22,
    y + 36
  );

  y += 78;

  normalizedRows.forEach(function (row, index) {
    const cardX = side;
    const cardW =
      width - side * 2;

    ctx.font =
      '500 23px "Pretendard","Noto Sans KR",Arial,sans-serif';

    const reasonLines =
      wrapCanvasText_(
        ctx,
        row.reason,
        cardW - 44
      );

    const cardH =
      108 +
      Math.max(
        0,
        reasonLines.length - 1
      ) * 32;

    ctx.fillStyle =
      index % 2 === 0
        ? "#ffffff"
        : "#f8fafc";

    ctx.strokeStyle = "#dde5ee";
    ctx.lineWidth = 2;

    roundRectCanvas_(
      ctx,
      cardX,
      y,
      cardW,
      cardH,
      16
    );
    ctx.fill();
    ctx.stroke();

    /* 첫 줄 */
    ctx.fillStyle = "#172033";
    ctx.font =
      '800 26px "Pretendard","Noto Sans KR",Arial,sans-serif';

    ctx.fillText(
      row.date,
      cardX + 22,
      y + 38
    );

    ctx.fillStyle = "#24588f";
    ctx.font =
      '800 24px "Pretendard","Noto Sans KR",Arial,sans-serif';

    ctx.fillText(
      row.type + " · " + row.days,
      cardX + 360,
      y + 38
    );

    const statusText =
      row.status || "-";

    const approved =
      statusText.includes("승인");

    ctx.fillStyle =
      approved
        ? "#e2f5ea"
        : statusText.includes("반려")
          ? "#fde7e5"
          : "#fff0c9";

    roundRectCanvas_(
      ctx,
      cardX + cardW - 142,
      y + 13,
      116,
      40,
      20
    );
    ctx.fill();

    ctx.fillStyle =
      approved
        ? "#16734b"
        : statusText.includes("반려")
          ? "#aa2d27"
          : "#8a5a00";

    ctx.font =
      '800 20px "Pretendard","Noto Sans KR",Arial,sans-serif';

    ctx.textAlign = "center";
    ctx.fillText(
      statusText,
      cardX + cardW - 84,
      y + 40
    );
    ctx.textAlign = "left";

    /* 사유 */
    ctx.fillStyle = "#5f6b7a";
    ctx.font =
      '500 22px "Pretendard","Noto Sans KR",Arial,sans-serif';

    let reasonY =
      y + 78;

    reasonLines.forEach(function (line) {
      ctx.fillText(
        "사유: " + line,
        cardX + 22,
        reasonY
      );
      reasonY += 32;
    });

    y +=
      cardH +
      rowGap;
  });

  ctx.fillStyle = "#8793a2";
  ctx.font =
    '500 20px "Pretendard","Noto Sans KR",Arial,sans-serif';

  ctx.fillText(
    "더큰코리아 인사관리 · 조회 시점 기준",
    side,
    canvas.height - 62
  );

  ledgerKakaoCanvasCache[type] =
    canvas;

  const image =
    $(
      isLeave
        ? "leaveKakaoPreviewImg"
        : "compKakaoPreviewImg"
    );

  const wrap =
    $(
      isLeave
        ? "leaveKakaoPreviewWrap"
        : "compKakaoPreviewWrap"
    );

  if (image) {
    image.src =
      canvas.toDataURL("image/png");
  }

  if (wrap) {
    wrap.classList.remove("hidden");
    wrap.scrollIntoView({
      behavior: "smooth",
      block: "nearest"
    });
  }

  copyLedgerKakaoImage(type, true);
}


function roundRectCanvas_(ctx, x, y, w, h, r) {
  const radius =
    Math.min(
      r,
      w / 2,
      h / 2
    );

  ctx.beginPath();
  ctx.moveTo(
    x + radius,
    y
  );
  ctx.arcTo(
    x + w,
    y,
    x + w,
    y + h,
    radius
  );
  ctx.arcTo(
    x + w,
    y + h,
    x,
    y + h,
    radius
  );
  ctx.arcTo(
    x,
    y + h,
    x,
    y,
    radius
  );
  ctx.arcTo(
    x,
    y,
    x + w,
    y,
    radius
  );
  ctx.closePath();
}


async function copyLedgerKakaoImage(type, silent) {
  const canvas =
    ledgerKakaoCanvasCache[type];

  if (!canvas) {
    if (!silent) {
      alert("먼저 카톡 이미지를 만들어주세요.");
    }
    return;
  }

  try {
    const blob =
      await new Promise(function (resolve) {
        canvas.toBlob(
          resolve,
          "image/png"
        );
      });

    if (
      navigator.clipboard &&
      window.ClipboardItem &&
      blob
    ) {
      await navigator.clipboard.write([
        new ClipboardItem({
          "image/png": blob
        })
      ]);

      if (!silent) {
        alert(
          "이미지가 복사되었습니다. 카카오톡 대화창에 붙여넣기(Ctrl+V) 하세요."
        );
      }
      return;
    }

    if (!silent) {
      alert(
        "이 브라우저에서는 이미지 자동 복사가 지원되지 않습니다. 미리보기 이미지를 우클릭해 복사해 주세요."
      );
    }

  } catch (error) {
    if (!silent) {
      alert(
        "이미지 복사가 제한되었습니다. 미리보기 이미지를 우클릭해 복사해 주세요."
      );
    }
  }
}


async function openLeaveLedgerDetail(summaryRow) {
  const modal = $('leaveLedgerDetailModal');
  const title = $('leaveLedgerDetailTitle');
  const summary = $('leaveLedgerDetailSummary');
  const body = $('leaveLedgerDetailBody');

  if (!modal || !body) return;

  title.textContent =
    (summaryRow.name || '') + ' 연월차 사용내역';

  summary.innerHTML =
    '<strong>' +
    escapeHtml(summaryRow.store || '') +
    ' · ' +
    escapeHtml(summaryRow.name || '') +
    '</strong>' +
    ' &nbsp; 발생 ' +
    Number(summaryRow.generated || 0) +
    '일 / 승인사용 ' +
    Number(summaryRow.used || 0) +
    '일 / 승인대기 ' +
    Number(summaryRow.pending || 0) +
    '일 / 잔여 <strong>' +
    Number(summaryRow.remain || 0) +
    '일</strong>';

  body.innerHTML =
    '<tr><td colspan="6" class="empty">사용내역을 불러오는 중입니다.</td></tr>';

  const previewWrap = $("leaveKakaoPreviewWrap");
  if (previewWrap) previewWrap.classList.add("hidden");
  ledgerKakaoCanvasCache.leave = null;

  modal.classList.add('show');

  try {
    if (!Array.isArray(adminRequests) || !adminRequests.length) {
      await loadAdminRequests();
    }

    const targetStore =
      String(summaryRow.store || '').trim();

    const targetName =
      String(summaryRow.name || '').trim();

    const targetPhone =
      String(summaryRow.phone || '')
        .replace(/[^0-9]/g, '');

    const rows =
      (adminRequests || [])
        .filter(function (r) {
          const rowStore =
            String(
              r['매장'] ||
              r['소속'] ||
              ''
            ).trim();

          const rowName =
            String(
              r['이름'] ||
              r['직원명'] ||
              ''
            ).trim();

          const rowPhone =
            String(
              r['연락처'] ||
              r['휴대폰'] ||
              ''
            ).replace(/[^0-9]/g, '');

          return (
            rowStore === targetStore &&
            rowName === targetName &&
            (!targetPhone || rowPhone === targetPhone)
          );
        })
        .sort(function (a, b) {
          return String(
            a['시작일'] || ''
          ).localeCompare(
            String(
              b['시작일'] || ''
            )
          );
        });

    if (!rows.length) {
      body.innerHTML =
        '<tr><td colspan="6" class="empty">' +
        '등록된 연월차 신청·사용내역이 없습니다.' +
        '</td></tr>';
      return;
    }

    body.innerHTML =
      rows.map(function (r) {
        const leaveType =
          String(
            r['휴가종류'] ||
            r['휴가구분'] ||
            '-'
          );

        const start =
          formatRequestDate(
            r['시작일'],
            false
          );

        const end =
          formatRequestDate(
            r['종료일'],
            false
          );

        const period =
          start === end
            ? start
            : start + ' ~ ' + end;

        const days =
          Number(
            r['사용일수'] ||
            r['일수'] ||
            0
          );

        const reason =
          String(
            r['사유'] ||
            '-'
          );

        const status =
          String(
            r['상태'] ||
            '대기'
          );

        return (
          '<tr>' +
            '<td>' + escapeHtml(period) + '</td>' +
            '<td>' + escapeHtml(leaveType) + '</td>' +
            '<td>' + days + '일</td>' +
            '<td>' + escapeHtml(reason) + '</td>' +
            '<td>' + getStatusBadge(status) + '</td>' +
            '<td>' +
              escapeHtml(
                r['관리자메모'] ||
                '-'
              ) +
            '</td>' +
          '</tr>'
        );
      }).join('');

  } catch (e) {
    body.innerHTML =
      '<tr><td colspan="6" class="empty">' +
      escapeHtml(
        e.message ||
        '조회 중 오류가 발생했습니다.'
      ) +
      '</td></tr>';
  }
}

function closeLeaveLedgerDetail() {
  const modal = $('leaveLedgerDetailModal');
  if (modal) modal.classList.remove('show');
}

function closeLeaveLedgerDetailByOutside(event) {
  if (
    event &&
    event.target &&
    event.target.id === 'leaveLedgerDetailModal'
  ) {
    closeLeaveLedgerDetail();
  }
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
function showEmployeeBalanceSummary(store, name, phone) {
  const decodedStore = decodeURIComponent(store || "");
  const decodedName = decodeURIComponent(name || "");
  const decodedPhone = decodeURIComponent(phone || "");

  const employee = employeeRows.find(function(row) {
    const rowStore = String(row.store || row["근무지"] || row["매장"] || row["소속"] || "");
    const rowName = String(row.name || row["이름"] || row["직원명"] || row["성명"] || "");
    const rowPhone = String(row.phone || row["연락처"] || row["휴대폰"] || row["전화번호"] || "");
    return rowStore === decodedStore && rowName === decodedName && rowPhone === decodedPhone;
  });

  if (employee) renderEmployeeBalanceSummary(employee);
}

function closeEmployeeBalanceSummary() {
  employeeBalanceRequestId++;
  const box = document.getElementById("employeeBalanceSummary");
  if (!box) return;
  box.style.display = "none";
  box.innerHTML = "";
}

async function renderEmployeeBalanceSummary(selectedEmployee) {

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

  if (!selectedEmployee && !keyword) {
    box.style.display = "none";
    box.innerHTML = "";
    return;
  }

  let employee = selectedEmployee || null;

  if (!employee) {
    const matches = employeeRows.filter(function(row) {

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

    employee = matches[0];
  }

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

    const special = leave.special || leave.specialLeave || {};
    const spouse = leave.spouse || leave.spouseLeave || {};

    function firstNumber() {
      for (let i = 0; i < arguments.length; i++) {
        const value = arguments[i];
        if (value !== undefined && value !== null && value !== "" && isFinite(Number(value))) {
          return Number(value);
        }
      }
      return 0;
    }

    const specialGranted = firstNumber(leave.specialGranted, leave.specialBase, special.granted, special.base);
    const specialUsed = firstNumber(leave.specialUsed, special.used);
    const specialPending = firstNumber(leave.specialPending, special.pending);
    const specialRemain = firstNumber(leave.specialRemain, leave.specialBalance, leave.specialLeaveRemain, special.remain, special.balance, Math.max(0, specialGranted - specialUsed - specialPending));

    const spouseGranted = firstNumber(leave.spouseGranted, leave.spouseBase, spouse.granted, spouse.base);
    const spouseUsed = firstNumber(leave.spouseUsed, spouse.used);
    const spousePending = firstNumber(leave.spousePending, spouse.pending);
    const spouseRemain = firstNumber(leave.spouseRemain, leave.spouseBalance, leave.spouseLeaveRemain, spouse.remain, spouse.balance, Math.max(0, spouseGranted - spouseUsed - spousePending));

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
            "이월 연월차"
          )}
        </div>

        <div>
          이월 잔여
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

        <div style="padding:18px;border:1px solid #dce3eb;border-radius:16px;background:#fff;line-height:1.8;">
          <div style="font-size:17px;font-weight:900;color:#9a6416;margin-bottom:12px;">
            특별휴가
          </div>
          부여 <strong>${specialGranted}일</strong><br>
          승인 사용 <strong>${specialUsed}일</strong><br>
          승인 대기 <strong>${specialPending}일</strong>
          <div style="margin-top:14px;padding-top:12px;border-top:1px solid #e7ebf0;font-size:19px;color:#178b59;font-weight:900;">
            현재 잔여 ${specialRemain}일
          </div>
        </div>

        <div style="padding:18px;border:1px solid #dce3eb;border-radius:16px;background:#fff;line-height:1.8;">
          <div style="font-size:17px;font-weight:900;color:#7b4a9e;margin-bottom:12px;">
            배우자 출산휴가
          </div>
          발생 <strong>${spouseGranted}일</strong><br>
          승인 사용 <strong>${spouseUsed}일</strong><br>
          승인 대기 <strong>${spousePending}일</strong>
          <div style="margin-top:14px;padding-top:12px;border-top:1px solid #e7ebf0;font-size:19px;color:#178b59;font-weight:900;">
            현재 잔여 ${spouseRemain}일
          </div>
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

let currentCompLedgerDetailRows = [];
let currentCompLedgerDetailView = 'split';
let currentCompLedgerSummaryRow = null;
let currentCompLedgerPeriodMode = 'year';


function getCompLedgerDisplayRow_(r) {
  const type =
    String(
      r['구분'] ||
      r.type ||
      '-'
    );

  const rawDate =
    type === '발생'
      ? (r['발생일'] || r.workDate || '-')
      : (r['사용일'] || r.useDate || '-');

  const date =
    type === '사용'
      ? getCompUsePeriod(
          rawDate,
          r['일수'] || r.days
        )
      : formatRequestDate(
          rawDate,
          false
        );

  return {
    type: type,
    date: date,
    days: Number(r['일수'] || r.days || 0),
    reason: String(r['사유'] || r.reason || '-'),
    status: String(r['상태'] || r.status || '대기'),
    registered:
      r['등록일시'] ||
      r.registeredAt ||
      '-',
    rawStart: formatRequestDate(rawDate, false),
    rawEnd:
      type === '사용'
        ? getCompUsePeriod(rawDate, r['일수'] || r.days).split(' ~ ').slice(-1)[0]
        : formatRequestDate(rawDate, false)
  };
}


function renderCompLedgerDetailRows_() {
  const allBody = $('compLedgerDetailBody');
  const createBody = $('compLedgerCreateBody');
  const useBody = $('compLedgerUseBody');

  const rows = currentCompLedgerDetailRows || [];
  const allDisplayRows = rows.map(getCompLedgerDisplayRow_);

  const startDate = $('compLedgerStartDate')
    ? $('compLedgerStartDate').value
    : '';
  const endDate = $('compLedgerEndDate')
    ? $('compLedgerEndDate').value
    : '';

  const displayRows = allDisplayRows.filter(function(row) {
    if (row.rawStart === '-' || row.rawEnd === '-') return true;

    /* 사용기간이 조회기간과 하루라도 겹치면 표시 */
    if (startDate && row.rawEnd < startDate) return false;
    if (endDate && row.rawStart > endDate) return false;

    return true;
  });

  const createRows = displayRows.filter(function(row) {
    return row.type === '발생';
  });

  const useRows = displayRows.filter(function(row) {
    return row.type === '사용';
  });

  const createApprovedDays = createRows.reduce(function(sum, row) {
    return sum + (row.status === '승인' ? Number(row.days || 0) : 0);
  }, 0);

  const useApprovedDays = useRows.reduce(function(sum, row) {
    return sum + (row.status === '승인' ? Number(row.days || 0) : 0);
  }, 0);


  const summary = $('compLedgerDetailSummary');
  const periodInfo = $('compLedgerPeriodInfo');
  const summaryRow = currentCompLedgerSummaryRow || {};

  const periodText =
    currentCompLedgerPeriodMode === 'all'
      ? '전체기간'
      : ((startDate || '-') + ' ~ ' + (endDate || '-'));

  if (summary) {
    summary.innerHTML =
      '<strong>' +
      escapeHtml(summaryRow.store || '') +
      ' · ' +
      escapeHtml(summaryRow.name || '') +
      '</strong>' +
      ' &nbsp; 조회기간 발생 <strong>' +
      createApprovedDays +
      '일</strong> / 사용 <strong>' +
      useApprovedDays +
      '일</strong> / 현재 잔여 <strong>' +
      Number(summaryRow.remain || 0) +
      '일</strong>' +
      '<br><span style="font-size:12px;color:#7a8797;">조회기간: ' +
      escapeHtml(periodText) +
      '</span>';
  }

  if (periodInfo) {
    periodInfo.textContent =
      '현재 표시: ' + periodText +
      ' · 발생 ' + createRows.length + '건 / 사용 ' + useRows.length + '건' +
      ' · 현재 잔여는 전체 누적 기준입니다.';
  }

  if ($('compLedgerCreateTotal')) {
    $('compLedgerCreateTotal').textContent =
      '승인 ' + createApprovedDays + '일 · ' + createRows.length + '건';
  }

  if ($('compLedgerUseTotal')) {
    $('compLedgerUseTotal').textContent =
      '승인 ' + useApprovedDays + '일 · ' + useRows.length + '건';
  }

  if (createBody) {
    createBody.innerHTML = createRows.length
      ? createRows.map(function(row) {
          return (
            '<tr>' +
              '<td>' + escapeHtml(row.date) + '</td>' +
              '<td><strong>' + row.days + '일</strong></td>' +
              '<td>' + escapeHtml(row.reason) + '</td>' +
              '<td>' + getStatusBadge(row.status) + '</td>' +
            '</tr>'
          );
        }).join('')
      : '<tr><td colspan="4" class="empty">미휴무 발생내역이 없습니다.</td></tr>';
  }

  if (useBody) {
    useBody.innerHTML = useRows.length
      ? useRows.map(function(row) {
          return (
            '<tr>' +
              '<td>' + escapeHtml(row.date) + '</td>' +
              '<td><strong>' + row.days + '일</strong></td>' +
              '<td>' + escapeHtml(row.reason) + '</td>' +
              '<td>' + getStatusBadge(row.status) + '</td>' +
            '</tr>'
          );
        }).join('')
      : '<tr><td colspan="4" class="empty">미휴무 사용내역이 없습니다.</td></tr>';
  }

  /*
   * 전체 원장 tbody는 숨겨져 있어도 항상 채워 둡니다.
   * 기존 카톡 이미지 만들기 기능이 이 tbody를 읽기 때문에
   * 기능을 깨지 않고 그대로 사용할 수 있습니다.
   */
  if (allBody) {
    allBody.innerHTML = displayRows.length
      ? displayRows.map(function(row) {
          return (
            '<tr>' +
              '<td>' +
                escapeHtml(formatRequestDate(row.registered, true)) +
              '</td>' +
              '<td>' + escapeHtml(row.type) + '</td>' +
              '<td>' + escapeHtml(row.date) + '</td>' +
              '<td>' + row.days + '일</td>' +
              '<td>' + escapeHtml(row.reason) + '</td>' +
              '<td>' + getStatusBadge(row.status) + '</td>' +
            '</tr>'
          );
        }).join('')
      : '<tr><td colspan="6" class="empty">등록된 미휴무 발생·사용내역이 없습니다.</td></tr>';
  }
}



function getKoreaTodayText_() {
  const parts = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date());

  const map = {};
  parts.forEach(function(part) {
    map[part.type] = part.value;
  });

  return map.year + '-' + map.month + '-' + map.day;
}


function setCompLedgerPeriodThisYear() {
  const today = getKoreaTodayText_();
  const year = today.substring(0, 4);

  if ($('compLedgerStartDate')) {
    $('compLedgerStartDate').value = year + '-01-01';
  }

  if ($('compLedgerEndDate')) {
    $('compLedgerEndDate').value = today;
  }

  currentCompLedgerPeriodMode = 'year';
  renderCompLedgerDetailRows_();

  const previewWrap = $('compKakaoPreviewWrap');
  if (previewWrap) previewWrap.classList.add('hidden');
  ledgerKakaoCanvasCache.comp = null;
}


function setCompLedgerPeriodAll() {
  if ($('compLedgerStartDate')) {
    $('compLedgerStartDate').value = '';
  }

  if ($('compLedgerEndDate')) {
    $('compLedgerEndDate').value = '';
  }

  currentCompLedgerPeriodMode = 'all';
  renderCompLedgerDetailRows_();

  const previewWrap = $('compKakaoPreviewWrap');
  if (previewWrap) previewWrap.classList.add('hidden');
  ledgerKakaoCanvasCache.comp = null;
}


function applyCompLedgerPeriod() {
  const startDate = $('compLedgerStartDate')
    ? $('compLedgerStartDate').value
    : '';

  const endDate = $('compLedgerEndDate')
    ? $('compLedgerEndDate').value
    : '';

  if (startDate && endDate && startDate > endDate) {
    alert('조회 시작일은 종료일보다 늦을 수 없습니다.');
    return;
  }

  currentCompLedgerPeriodMode =
    (!startDate && !endDate)
      ? 'all'
      : 'custom';

  renderCompLedgerDetailRows_();

  const previewWrap = $('compKakaoPreviewWrap');
  if (previewWrap) previewWrap.classList.add('hidden');
  ledgerKakaoCanvasCache.comp = null;
}


function setCompLedgerDetailView(view) {
  const splitView = $('compLedgerSplitView');
  const allView = $('compLedgerAllView');
  const createPanel = $('compLedgerCreatePanel');
  const usePanel = $('compLedgerUsePanel');

  currentCompLedgerDetailView =
    ['split', 'create', 'use', 'all'].includes(view)
      ? view
      : 'split';

  document
    .querySelectorAll('[data-comp-view]')
    .forEach(function(button) {
      button.classList.toggle(
        'active',
        button.getAttribute('data-comp-view') === currentCompLedgerDetailView
      );
    });

  if (currentCompLedgerDetailView === 'all') {
    if (splitView) splitView.classList.add('hidden');
    if (allView) allView.classList.remove('hidden');
    return;
  }

  if (allView) allView.classList.add('hidden');

  if (splitView) {
    splitView.classList.remove('hidden');
    splitView.classList.toggle(
      'single',
      currentCompLedgerDetailView !== 'split'
    );
  }

  if (createPanel) {
    createPanel.classList.toggle(
      'hidden',
      currentCompLedgerDetailView === 'use'
    );
  }

  if (usePanel) {
    usePanel.classList.toggle(
      'hidden',
      currentCompLedgerDetailView === 'create'
    );
  }
}


async function openCompLedgerDetail(summaryRow) {
  const modal = $('compLedgerDetailModal');
  const title = $('compLedgerDetailTitle');
  const summary = $('compLedgerDetailSummary');
  const body = $('compLedgerDetailBody');
  const createBody = $('compLedgerCreateBody');
  const useBody = $('compLedgerUseBody');

  if (!modal || !body) return;

  currentCompLedgerSummaryRow = summaryRow;

  title.textContent =
    (summaryRow.name || '') + ' 미휴무 상세내역';

  summary.innerHTML =
    '<strong>' +
    escapeHtml(summaryRow.store || '') +
    ' · ' +
    escapeHtml(summaryRow.name || '') +
    '</strong>' +
    ' &nbsp; 승인발생 <strong>' +
    Number(summaryRow.approvedCreate || 0) +
    '일</strong> / 승인사용 <strong>' +
    Number(summaryRow.approvedUse || 0) +
    '일</strong> / 현재 잔여 <strong>' +
    Number(summaryRow.remain || 0) +
    '일</strong>';

  body.innerHTML =
    '<tr><td colspan="6" class="empty">내역을 불러오는 중입니다.</td></tr>';

  if (createBody) {
    createBody.innerHTML =
      '<tr><td colspan="4" class="empty">발생내역을 불러오는 중입니다.</td></tr>';
  }

  if (useBody) {
    useBody.innerHTML =
      '<tr><td colspan="4" class="empty">사용내역을 불러오는 중입니다.</td></tr>';
  }

  const previewWrap = $("compKakaoPreviewWrap");
  if (previewWrap) previewWrap.classList.add("hidden");
  ledgerKakaoCanvasCache.comp = null;

  currentCompLedgerDetailRows = [];

  const todayText = getKoreaTodayText_();
  const thisYear = todayText.substring(0, 4);

  if ($('compLedgerStartDate')) {
    $('compLedgerStartDate').value = thisYear + '-01-01';
  }

  if ($('compLedgerEndDate')) {
    $('compLedgerEndDate').value = todayText;
  }

  currentCompLedgerPeriodMode = 'year';
  setCompLedgerDetailView('split');

  modal.classList.add('show');

  try {
    if (!Array.isArray(compRequests) || !compRequests.length) {
      await loadCompRequests();
    }

    const targetStore =
      String(summaryRow.store || '').trim();

    const targetName =
      String(summaryRow.name || '').trim();

    const targetPhone =
      String(summaryRow.phone || '')
        .replace(/[^0-9]/g, '');

    currentCompLedgerDetailRows =
      (compRequests || [])
        .filter(function (r) {
          const rowStore =
            String(
              r['매장'] ||
              r['소속'] ||
              r.store ||
              ''
            ).trim();

          const rowName =
            String(
              r['이름'] ||
              r['직원명'] ||
              r.name ||
              ''
            ).trim();

          const rowPhone =
            String(
              r['연락처'] ||
              r['휴대폰'] ||
              r.phone ||
              ''
            ).replace(/[^0-9]/g, '');

          return (
            rowStore === targetStore &&
            rowName === targetName &&
            (!targetPhone || rowPhone === targetPhone)
          );
        })
        .sort(function (a, b) {
          const aDate =
            a['사용일'] ||
            a['발생일'] ||
            a['등록일시'] ||
            '';

          const bDate =
            b['사용일'] ||
            b['발생일'] ||
            b['등록일시'] ||
            '';

          return getDateTimeNumber(aDate) - getDateTimeNumber(bDate);
        });

    renderCompLedgerDetailRows_();

  } catch (e) {
    currentCompLedgerDetailRows = [];

    if (body) {
      body.innerHTML =
        '<tr><td colspan="6" class="empty">' +
        escapeHtml(e.message || '조회 중 오류가 발생했습니다.') +
        '</td></tr>';
    }

    if (createBody) {
      createBody.innerHTML =
        '<tr><td colspan="4" class="empty">발생내역 조회 중 오류가 발생했습니다.</td></tr>';
    }

    if (useBody) {
      useBody.innerHTML =
        '<tr><td colspan="4" class="empty">사용내역 조회 중 오류가 발생했습니다.</td></tr>';
    }
  }
}


function closeCompLedgerDetail() {
  const modal = $('compLedgerDetailModal');
  if (modal) modal.classList.remove('show');
}
function closeCompLedgerDetailByOutside(event) {
  if (event && event.target && event.target.id === 'compLedgerDetailModal') closeCompLedgerDetail();
}
