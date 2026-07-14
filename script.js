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

  const recent = adminRequests.slice(0, 8);

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
        return (
          String(row["ID"]) ===
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

  $("detailContent").innerHTML = `
    <dt>신청번호</dt>
    <dd>${escapeHtml(row["ID"])}</dd>

    <dt>신청일</dt>
    <dd>${escapeHtml(row["신청일시"])}</dd>

    <dt>매장</dt>
    <dd>${escapeHtml(row["매장"])}</dd>

    <dt>직원</dt>
    <dd>
      ${escapeHtml(row["이름"])}
      /
      ${escapeHtml(
        formatEmployeePhone(
          row["연락처"]
        )
      )}
    </dd>

    <dt>휴가종류</dt>
    <dd>${escapeHtml(row["휴가종류"])}</dd>

    <dt>기간</dt>
    <dd>
      ${escapeHtml(row["시작일"])}
      ~
      ${escapeHtml(row["종료일"])}
    </dd>

    <dt>사용일수</dt>
    <dd>
      ${escapeHtml(row["사용일수"])}일
    </dd>

    <dt>사유</dt>
    <dd>
      ${escapeHtml(row["사유"] || "-")}
    </dd>

    <dt>상태</dt>
    <dd>
      ${getStatusBadge(row["상태"])}
    </dd>

    <dt>관리자메모</dt>
    <dd>
      ${escapeHtml(
        row["관리자메모"] || "-"
      )}
    </dd>

    <dt>처리일시</dt>
    <dd>
      ${escapeHtml(
        row["처리일시"] || "-"
      )}
    </dd>
  `;

  const isPending =
    String(row["상태"]) === "대기";

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
      id: selectedRequest["ID"],
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

        if (
          status !== "전체" &&
          String(row["상태"]) !== status
        ) {
          return false;
        }

        return true;
      }
    );

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
        const dateText =
          String(row["구분"]) === "발생"
            ? row["발생일"]
            : row["사용일"];

        const isPending =
          String(row["상태"]) === "대기";

        return `
          <tr>
            <td>
              ${escapeHtml(row["등록일시"])}
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
              ${escapeHtml(dateText || "-")}
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

    loadCompRequests();

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
  const body =
    $("employeeBody");

  const keyword =
    String(
      $("employeeKeyword")
        ? $("employeeKeyword").value
        : ""
    )
      .trim()
      .toLowerCase();

  const rows =
    employeeRows.filter(
      function (row) {
        const text = [
          row.store,
          row.name,
          row.phone,
          row.status
        ]
          .join(" ")
          .toLowerCase();

        return (
          !keyword ||
          text.includes(keyword)
        );
      }
    );

  if (!rows.length) {
    body.innerHTML = `
      <tr>
        <td colspan="7" class="empty">
          등록된 직원이 없습니다.
        </td>
      </tr>
    `;

    return;
  }

  body.innerHTML =
    rows
      .map(function (row) {
        const isRetired =
          String(row.status) === "퇴사";

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
              ${
                isRetired
                  ? `
                    <span class="badge badge-rejected">
                      퇴사
                    </span>
                  `
                  : `
                    <span class="badge badge-active">
                      ${escapeHtml(
                        row.status || "재직"
                      )}
                    </span>
                  `
              }
            </td>

            <td>
              ${escapeHtml(
                row.updatedAt || "-"
              )}
            </td>

           <td>
  ${
    isRetired
      ? "-"
      : `
        <button
          class="btn btn-outline btn-small"
          onclick="resetEmployeePin(
            '${encodeURIComponent(row.store)}',
            '${encodeURIComponent(row.name)}',
            '${encodeURIComponent(row.phone)}'
          )"
        >
          PIN 초기화
        </button>

        <button
          class="btn btn-red btn-small"
          onclick="retireEmployee(
            '${encodeURIComponent(row.store)}',
            '${encodeURIComponent(row.name)}',
            '${encodeURIComponent(row.phone)}'
          )"
        >
          퇴사처리
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