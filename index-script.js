const SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbx7Y5zaVU7kYTdFwdwhUgoKwqOGx55-8a0McZOmA42PpbU4WWJqYTFPeSH2oD4mOzd7/exec";


function $(id) {
  return document.getElementById(id);
}


function showMessage(id, message) {
  const box = $(id);

  if (!box) return;

  box.textContent = message;
  box.classList.add("show");
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


/* =========================
   탭
========================= */

function showTab(tabName) {
  const tabs = [
    "apply",
    "register",
    "history",
    "comp"
  ];

  tabs.forEach(function (name) {
    const section = $(name + "Tab");

    if (section) {
      section.classList.toggle(
        "hidden",
        name !== tabName
      );
    }
  });

  document
    .querySelectorAll(".tab")
    .forEach(function (button) {
      button.classList.remove("active");
    });

  const index = tabs.indexOf(tabName);
  const buttons = document.querySelectorAll(".tab");

  if (buttons[index]) {
    buttons[index].classList.add("active");
  }

  if (tabName === "register") {
    copyEmployeeFieldsToRegister();
  }

  if (tabName === "comp") {
    copyEmployeeFieldsToComp();
  }
}


function copyEmployeeFieldsToRegister() {
  if ($("regName") && $("name")) {
    $("regName").value = $("name").value.trim();
  }

  if ($("regPhone") && $("phone")) {
    $("regPhone").value = $("phone").value.trim();
  }

  if ($("regStore") && $("store")) {
    $("regStore").value = $("store").value;
  }
}


function copyEmployeeFieldsToComp() {
  if ($("compName") && $("name")) {
    $("compName").value = $("name").value.trim();
  }

  if ($("compPhone") && $("phone")) {
    $("compPhone").value = $("phone").value.trim();
  }

  if ($("compStore") && $("store")) {
    $("compStore").value = $("store").value;
  }
}


/* =========================
   연월차 날짜 계산
========================= */

function calculateLeaveDays() {
  const startValue = $("startDate").value;
  const endValue = $("endDate").value;
  const leaveType = $("leaveType").value;

  if (!startValue || !endValue) {
    $("days").value = "";
    return;
  }

  const start = new Date(startValue + "T00:00:00");
  const end = new Date(endValue + "T00:00:00");

  if (end < start) {
    $("days").value = "";
    showMessage(
      "result",
      "종료일은 시작일보다 빠를 수 없습니다."
    );
    return;
  }

  if (
    leaveType === "오전 반차" ||
    leaveType === "오후 반차"
  ) {
    $("days").value = 0.5;
    return;
  }

  const difference =
    Math.floor(
      (end.getTime() - start.getTime()) /
      86400000
    ) + 1;

  $("days").value = difference;
}


document.addEventListener(
  "DOMContentLoaded",
  function () {
    if ($("startDate")) {
      $("startDate").addEventListener(
        "change",
        calculateLeaveDays
      );
    }

    if ($("endDate")) {
      $("endDate").addEventListener(
        "change",
        calculateLeaveDays
      );
    }

    if ($("leaveType")) {
      $("leaveType").addEventListener(
        "change",
        calculateLeaveDays
      );
    }
  }
);


/* =========================
   직원등록
========================= */

async function registerEmployee() {
  const data = {
    action: "register",
    store: $("regStore").value,
    name: $("regName").value.trim(),
    phone: $("regPhone").value.trim(),
    hireDate: $("hireDate").value
  };

  if (!data.name) {
    showMessage(
      "registerResult",
      "이름을 입력하세요."
    );
    return;
  }

  if (!data.phone) {
    showMessage(
      "registerResult",
      "연락처를 입력하세요."
    );
    return;
  }

  if (!data.hireDate) {
    showMessage(
      "registerResult",
      "입사일을 선택하세요."
    );
    return;
  }

  try {
    await postNoCors(data);

    showMessage(
      "registerResult",
      "직원 등록 또는 수정 요청이 완료되었습니다."
    );

    $("name").value = data.name;
    $("phone").value = data.phone;
    $("store").value = data.store;

  } catch (error) {
    showMessage(
      "registerResult",
      "직원 등록 중 오류가 발생했습니다."
    );
  }
}


/* =========================
   연월차 잔여 조회
========================= */

async function checkBalance() {
  const name = $("name").value.trim();
  const phone = $("phone").value.trim();
  const box = $("balanceBox");

  if (!name || !phone) {
    showMessage(
      "result",
      "이름과 연락처를 입력하세요."
    );
    return;
  }

  box.innerHTML = "조회 중입니다.";
  box.classList.add("show");

  try {
    const result = await jsonp({
      action: "balance",
      name: name,
      phone: phone,
      t: Date.now()
    });

    if (!result.ok) {
      throw new Error(
        result.message || "조회 실패"
      );
    }

    const balance = result.balance;

    if (!balance.registered) {
      box.innerHTML =
        "직원 등록정보가 없습니다.<br>" +
        "직원등록 탭에서 먼저 등록하세요.";

      copyEmployeeFieldsToRegister();
      return;
    }

    box.innerHTML =
      "입사일: " + balance.hireDate + "<br>" +
      "근속기간: " +
      balance.workYears + "년 " +
      balance.workMonths + "개월<br>" +
      "발생 연월차: " + balance.base + "일<br>" +
      "승인 사용: " + balance.used + "일<br>" +
      "승인 대기: " + balance.pending + "일<br>" +
      "<strong>현재 잔여: " +
      balance.remain + "일</strong>";

  } catch (error) {
    box.innerHTML =
      error.message ||
      "잔여 연월차 조회 중 오류가 발생했습니다.";
  }
}


/* =========================
   연월차 신청
========================= */

async function submitLeave() {
  calculateLeaveDays();

  const data = {
    action: "apply",
    store: $("store").value,
    name: $("name").value.trim(),
    phone: $("phone").value.trim(),
    leaveType: $("leaveType").value,
    startDate: $("startDate").value,
    endDate: $("endDate").value,
    days: Number($("days").value || 0),
    reason: $("reason").value.trim()
  };

  if (
    !data.name ||
    !data.phone ||
    !data.leaveType ||
    !data.startDate ||
    !data.endDate ||
    !data.days
  ) {
    showMessage(
      "result",
      "필수 항목을 모두 입력하세요."
    );
    return;
  }

  try {
    const result = await jsonp(
      Object.assign({}, data, {
        t: Date.now()
      })
    );

    if (!result.ok) {
      throw new Error(
        result.message || "신청 실패"
      );
    }

    showMessage(
      "result",
      result.message || "신청이 접수되었습니다."
    );

    $("leaveType").value = "";
    $("startDate").value = "";
    $("endDate").value = "";
    $("days").value = "";
    $("reason").value = "";

    checkBalance();

  } catch (error) {
    showMessage(
      "result",
      error.message || "신청 중 오류가 발생했습니다."
    );
  }
}


/* =========================
   내 연월차 신청내역
========================= */

async function loadMyRequests() {
  const name = $("name").value.trim();
  const phone = $("phone").value.trim();
  const list = $("myList");

  if (!name || !phone) {
    list.innerHTML =
      '<div class="item">' +
      "연월차 신청 탭에 이름과 연락처를 입력하세요." +
      "</div>";
    return;
  }

  list.innerHTML =
    '<div class="item">조회 중입니다.</div>';

  try {
    const result = await jsonp({
      action: "my",
      name: name,
      phone: phone,
      t: Date.now()
    });

    if (!result.ok) {
      throw new Error(
        result.message || "조회 실패"
      );
    }

    const rows = result.rows || [];

    if (!rows.length) {
      list.innerHTML =
        '<div class="item">신청내역이 없습니다.</div>';
      return;
    }

    list.innerHTML = rows
      .map(renderLeaveHistoryItem)
      .join("");

  } catch (error) {
    list.innerHTML =
      '<div class="item">' +
      (error.message || "조회 중 오류가 발생했습니다.") +
      "</div>";
  }
}


function renderLeaveHistoryItem(row) {
  return `
    <div class="item">
      <div class="item-title">
        ${row["휴가종류"] || "-"}
        ${renderStatusBadge(row["상태"])}
      </div>

      <div class="item-meta">
        기간:
        ${formatDate(row["시작일"])}
        ~
        ${formatDate(row["종료일"])}
        <br>

        사용일수:
        ${row["사용일수"] || 0}일
        <br>

        사유:
        ${row["사유"] || "-"}
        <br>

        관리자 메모:
        ${row["관리자메모"] || "-"}
      </div>
    </div>
  `;
}


/* =========================
   미휴무 잔여 조회
========================= */

async function checkCompBalance() {
  const store = $("compStore").value;
  const name = $("compName").value.trim();
  const phone = $("compPhone").value.trim();
  const box = $("compBalanceBox");

  if (!name || !phone) {
    box.innerHTML =
      "이름과 연락처를 입력하세요.";
    box.classList.add("show");
    return;
  }

  box.innerHTML = "조회 중입니다.";
  box.classList.add("show");

  try {
    const result = await jsonp({
      action: "compBalance",
      store: store,
      name: name,
      phone: phone,
      t: Date.now()
    });

    if (!result.ok) {
      throw new Error(
        result.message || "조회 실패"
      );
    }

    box.innerHTML =
      "승인 발생: " + result.earned + "일<br>" +
      "승인 사용: " + result.used + "일<br>" +
      "발생 승인대기: " +
      result.pendingEarned + "일<br>" +
      "사용 승인대기: " +
      result.pendingUsed + "일<br>" +
      "<strong>현재 잔여 미휴무: " +
      result.balance + "일</strong>";

  } catch (error) {
    box.innerHTML =
      error.message ||
      "잔여 미휴무 조회 중 오류가 발생했습니다.";
  }
}


/* =========================
   추가근무 발생 등록
========================= */

async function submitExtraWork() {
  const data = {
    action: "extraWork",
    store: $("compStore").value,
    name: $("compName").value.trim(),
    phone: $("compPhone").value.trim(),
    workDate: $("extraWorkDate").value,
    days: Number($("extraDays").value || 0),
    reason: $("extraReason").value.trim()
  };

  if (
    !data.name ||
    !data.phone ||
    !data.workDate ||
    data.days <= 0
  ) {
    showMessage(
      "extraResult",
      "이름, 연락처, 추가근무일, 발생일수를 입력하세요."
    );
    return;
  }

  try {
    const result = await jsonp(
      Object.assign({}, data, {
        t: Date.now()
      })
    );

    if (!result.ok) {
      throw new Error(
        result.message || "등록 실패"
      );
    }

    showMessage(
      "extraResult",
      result.message ||
      "추가근무가 승인대기로 등록되었습니다."
    );

    $("extraWorkDate").value = "";
    $("extraDays").value = "";
    $("extraReason").value = "";

    checkCompBalance();
    loadMyCompHistory();

  } catch (error) {
    showMessage(
      "extraResult",
      error.message || "등록 중 오류가 발생했습니다."
    );
  }
}


/* =========================
   미휴무 사용신청
========================= */

async function submitCompUse() {
  const data = {
    action: "compUse",
    store: $("compStore").value,
    name: $("compName").value.trim(),
    phone: $("compPhone").value.trim(),
    useDate: $("compUseDate").value,
    days: Number($("compUseDays").value || 0),
    reason: $("compUseReason").value.trim()
  };

  if (
    !data.name ||
    !data.phone ||
    !data.useDate ||
    data.days <= 0
  ) {
    showMessage(
      "compUseResult",
      "이름, 연락처, 사용 예정일, 사용일수를 입력하세요."
    );
    return;
  }

  try {
    const result = await jsonp(
      Object.assign({}, data, {
        t: Date.now()
      })
    );

    if (!result.ok) {
      throw new Error(
        result.message || "신청 실패"
      );
    }

    showMessage(
      "compUseResult",
      result.message ||
      "미휴무 사용신청이 접수되었습니다."
    );

    $("compUseDate").value = "";
    $("compUseDays").value = "";
    $("compUseReason").value = "";

    checkCompBalance();
    loadMyCompHistory();

  } catch (error) {
    showMessage(
      "compUseResult",
      error.message || "신청 중 오류가 발생했습니다."
    );
  }
}


/* =========================
   내 미휴무 발생·사용내역
========================= */

async function loadMyCompHistory() {
  const name = $("compName").value.trim();
  const phone = $("compPhone").value.trim();
  const list = $("compHistoryList");

  if (!name || !phone) {
    list.innerHTML =
      '<div class="item">' +
      "이름과 연락처를 입력하세요." +
      "</div>";
    return;
  }

  list.innerHTML =
    '<div class="item">조회 중입니다.</div>';

  try {
    const result = await jsonp({
      action: "myCompHistory",
      name: name,
      phone: phone,
      t: Date.now()
    });

    if (!result.ok) {
      throw new Error(
        result.message || "조회 실패"
      );
    }

    const rows = result.rows || [];

    if (!rows.length) {
      list.innerHTML =
        '<div class="item">' +
        "등록된 미휴무 내역이 없습니다." +
        "</div>";
      return;
    }

    list.innerHTML = rows
      .map(function (row) {
        return `
          <div class="item">
            <div class="item-title">
              ${row.type || "-"}
              ${renderStatusBadge(row.status)}
            </div>

            <div class="item-meta">
              날짜:
              ${formatDate(row.date)}
              <br>

              일수:
              ${row.days || 0}일
              <br>

              사유:
              ${row.reason || "-"}
            </div>
          </div>
        `;
      })
      .join("");

  } catch (error) {
    list.innerHTML =
      '<div class="item">' +
      (error.message || "조회 중 오류가 발생했습니다.") +
      "</div>";
  }
}


/* =========================
   공통 표시
========================= */

function renderStatusBadge(status) {
  if (status === "승인") {
    return '<span class="badge ok">승인</span>';
  }

  if (status === "반려") {
    return '<span class="badge no">반려</span>';
  }

  return '<span class="badge wait">대기</span>';
}


function formatDate(value) {
  const text = String(value || "").trim();

  if (!text) return "-";

  return text.substring(0, 10);
}