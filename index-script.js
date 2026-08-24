const SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbx7Y5zaVU7kYTdFwdwhUgoKwqOGx55-8a0McZOmA42PpbU4WWJqYTFPeSH2oD4mOzd7/exec";

let employeeVerified = false;

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
  "pinReset",
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

  if (tabName === "pinReset") {
  copyEmployeeFieldsToPinReset();
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

function copyEmployeeFieldsToPinReset() {
  if ($("pinResetName") && $("name")) {
    $("pinResetName").value = $("name").value.trim();
  }

  if ($("pinResetPhone") && $("phone")) {
    $("pinResetPhone").value = $("phone").value.trim();
  }

  if ($("pinResetStore") && $("store")) {
    $("pinResetStore").value = $("store").value;
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
  const pin = $("regPin").value.trim();
  const pinConfirm = $("regPinConfirm").value.trim();

  const data = {
    action: "register",
    store: $("regStore").value,
    name: $("regName").value.trim(),
    phone: $("regPhone").value.trim(),
    hireDate: $("hireDate").value,
    pin: pin
  };

  if (!data.store) {
    showMessage(
      "registerResult",
      "근무지를 선택하세요."
    );
    return;
  }

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

  if (!/^[0-9]{4,8}$/.test(pin)) {
    showMessage(
      "registerResult",
      "PIN은 숫자 4~8자리로 입력하세요."
    );
    return;
  }

  if (pin !== pinConfirm) {
    showMessage(
      "registerResult",
      "PIN과 PIN 확인이 일치하지 않습니다."
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

    $("regStore").value = "";
    $("regName").value = "";
    $("regPhone").value = "";
    $("hireDate").value = "";
    $("regPin").value = "";
    $("regPinConfirm").value = "";

  } catch (error) {
    showMessage(
      "registerResult",
      "직원 등록 중 오류가 발생했습니다."
    );
  }
}

/* =========================
   PIN 재설정
========================= */

async function resetMyPin() {
  const store =
    $("pinResetStore").value;

  const name =
    $("pinResetName").value.trim();

  const phone =
    $("pinResetPhone").value.trim();

  const currentPin =
    $("pinResetCurrentPin").value.trim();

  const newPin =
    $("pinResetNewPin").value.trim();

  const newPinConfirm =
    $("pinResetNewPinConfirm").value.trim();

  if (!store) {
    showMessage(
      "pinResetResult",
      "근무지를 선택하세요."
    );
    return;
  }

  if (!name) {
    showMessage(
      "pinResetResult",
      "이름을 입력하세요."
    );
    return;
  }

  if (!phone) {
    showMessage(
      "pinResetResult",
      "연락처를 입력하세요."
    );
    return;
  }

  if (!currentPin) {
    showMessage(
      "pinResetResult",
      "임시 PIN을 입력하세요."
    );
    return;
  }

  if (!/^[0-9]{4,8}$/.test(newPin)) {
    showMessage(
      "pinResetResult",
      "새 PIN은 숫자 4~8자리로 입력하세요."
    );
    return;
  }

  if (newPin !== newPinConfirm) {
    showMessage(
      "pinResetResult",
      "새 PIN과 PIN 확인이 일치하지 않습니다."
    );
    return;
  }

  if (currentPin === newPin) {
    showMessage(
      "pinResetResult",
      "새 PIN은 임시 PIN과 다르게 설정하세요."
    );
    return;
  }

  try {
    const result = await jsonp({
      action: "changeEmployeePin",
      store: store,
      name: name,
      phone: phone,
      currentPin: currentPin,
      newPin: newPin,
      t: Date.now()
    });

    if (!result.ok) {
      throw new Error(
        result.message ||
        "PIN 변경에 실패했습니다."
      );
    }

    showMessage(
      "pinResetResult",
      result.message ||
      "새 PIN이 등록되었습니다."
    );

    $("pinResetCurrentPin").value = "";
    $("pinResetNewPin").value = "";
    $("pinResetNewPinConfirm").value = "";

    $("store").value = store;
    $("name").value = name;
    $("phone").value = phone;
    $("pin").value = "";

  } catch (error) {
    showMessage(
      "pinResetResult",
      error.message ||
      "PIN 재설정 중 오류가 발생했습니다."
    );
  }
}


/* =========================
   연월차 잔여 조회
========================= */

async function checkBalance() {

  if (!verifyEmployee()) {
  return;
}  

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
  store: $("store").value,
  name: name,
  phone: phone,
  pin: $("pin").value.trim(),
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

    box.innerHTML = `
      입사일: ${balance.hireDate}<br>
      근속기간: ${Number(balance.workYears || 0)}년 ${Number(balance.workMonths || 0)}개월<br>
      발생 연월차: ${Number(balance.base || 0)}일<br>
      승인 사용: ${Number(balance.used || 0)}일<br>
      승인 대기: ${Number(balance.pending || 0)}일<br>
      <strong>현재 잔여: ${Number(balance.remain || 0)}일</strong>

      <div style="margin-top:14px;padding:12px 14px;border:1px solid #d9c8b7;border-radius:12px;background:#fffaf5;line-height:1.7;">
        <strong>특별휴가</strong><br>
        부여 ${Number(balance.specialGenerated || balance.carryoverGenerated || 0)}일 ·
        승인 사용 ${Number(balance.specialUsed || balance.carryoverUsed || 0)}일 ·
        승인 대기 ${Number(balance.specialPending || 0)}일<br>
        <strong>현재 잔여 ${Number(balance.specialRemain || balance.carryoverRemain || 0)}일</strong>
      </div>

      ${balance.spouseBirthRegistered ? `
        <div style="margin-top:10px;padding:12px 14px;border:1px solid #c9d9ef;border-radius:12px;background:#f4f8fd;line-height:1.7;">
          <strong>배우자 출산휴가</strong><br>
          배우자 출산일 ${balance.spouseBirthDate || '-'}<br>
          발생 ${Number(balance.spouseBirthGenerated || 20)}일 ·
          승인 사용 ${Number(balance.spouseBirthUsed || 0)}일 ·
          승인 대기 ${Number(balance.spouseBirthPending || 0)}일<br>
          <strong>현재 잔여 ${Number(balance.spouseBirthRemain || 0)}일</strong>
          ${balance.spouseBirthExpireDate ? `<br><span style="font-size:13px;">사용기한: ${balance.spouseBirthExpireDate}</span>` : ''}
        </div>
      ` : ''}
    `;

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
  pin: $("pin").value.trim(),
  leaveType: $("leaveType").value,
  startDate: $("startDate").value,
  endDate: $("endDate").value,
  days: Number($("days").value || 0),
  reason: $("reason").value.trim()
};

  if (
  !data.store ||
  !data.name ||
  !data.phone ||
  !data.pin ||
  !data.leaveType ||
  !data.startDate ||
  !data.endDate ||
  !data.days
) {
  showMessage(
    "result",
   "근무지, 이름, 연락처, PIN을 포함한 필수 항목을 모두 입력하세요."
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
   내 연월차 사용내역
========================= */

async function loadMyRequests(selectedYear) {

  if (!verifyEmployee()) {
    return;
  }

  const name = $("name").value.trim();
  const phone = $("phone").value.trim();
  const store = $("store").value;
  const pin = $("pin").value.trim();
  const list = $("myList");
  const summary = $("historySummary");

  const currentYear = new Date().getFullYear();
  const year = Number(
    selectedYear ||
    ($("historyYear") ? $("historyYear").value : currentYear)
  ) || currentYear;

  if (!name || !phone) {
    list.innerHTML =
      '<div class="item">이름과 연락처를 입력하세요.</div>';
    return;
  }

  list.innerHTML = '<div class="item">조회 중입니다.</div>';
  if (summary) {
    summary.innerHTML = "조회 중입니다.";
    summary.classList.add("show");
  }

  try {
    const today = new Date();
    const asOfDate =
      year === currentYear
        ? [
            today.getFullYear(),
            String(today.getMonth() + 1).padStart(2, "0"),
            String(today.getDate()).padStart(2, "0")
          ].join("-")
        : year + "-12-31";

    const [requestResult, balanceResult] = await Promise.all([
      jsonp({
        action: "my",
        store: store,
        name: name,
        phone: phone,
        pin: pin,
        t: Date.now()
      }),
      jsonp({
        action: "balance",
        store: store,
        name: name,
        phone: phone,
        pin: pin,
        asOfDate: asOfDate,
        t: Date.now() + 1
      })
    ]);

    if (!requestResult.ok) {
      throw new Error(requestResult.message || "신청내역 조회 실패");
    }

    if (!balanceResult.ok) {
      throw new Error(balanceResult.message || "연월차 현황 조회 실패");
    }

    const allRows = requestResult.rows || [];
    const rows = allRows
      .filter(function (row) {
        const startDate = String(row["시작일"] || "").substring(0, 10);
        return startDate.substring(0, 4) === String(year);
      })
      .sort(function (a, b) {
        return String(a["시작일"] || "").localeCompare(
          String(b["시작일"] || "")
        );
      });

    const approvedDays = rows.reduce(function (sum, row) {
      if (String(row["상태"] || "").trim() !== "승인") return sum;
      return sum + Number(row["사용일수"] || 0);
    }, 0);

    const pendingDays = rows.reduce(function (sum, row) {
      if (String(row["상태"] || "").trim() !== "대기") return sum;
      return sum + Number(row["사용일수"] || 0);
    }, 0);

    const approvedCount = rows.filter(function (row) {
      return String(row["상태"] || "").trim() === "승인";
    }).length;

    const pendingCount = rows.filter(function (row) {
      return String(row["상태"] || "").trim() === "대기";
    }).length;

    const balance = balanceResult.balance || {};

    if (summary) {
      summary.innerHTML = `
        <div style="font-weight:900;font-size:18px;margin-bottom:10px;">
          ${year}년 연월차 현황
        </div>
        <div style="line-height:1.8;">
          발생 연월차: <strong>${Number(balance.base || 0)}일</strong><br>
          연월차 승인 사용: <strong>${Number(balance.used || 0)}일</strong><br>
          연월차 승인 대기: <strong>${Number(balance.pending || 0)}일</strong><br>
          현재 잔여: <strong>${Number(balance.remain || 0)}일</strong>
        </div>
        <div style="margin-top:12px;padding-top:12px;border-top:1px solid #d9e2ec;line-height:1.8;">
          ${year}년 신청건수: <strong>${rows.length}건</strong><br>
          승인된 휴가: <strong>${approvedCount}건 / ${approvedDays}일</strong><br>
          승인 대기: <strong>${pendingCount}건 / ${pendingDays}일</strong>
        </div>
        ${
          Number(balance.specialGenerated || 0) > 0
            ? `<div style="margin-top:12px;line-height:1.8;">
                 특별휴가 부여 ${Number(balance.specialGenerated || 0)}일 /
                 사용 ${Number(balance.specialUsed || 0)}일 /
                 잔여 <strong>${Number(balance.specialRemain || 0)}일</strong>
               </div>`
            : ""
        }
        ${
          balance.spouseBirthRegistered
            ? `<div style="margin-top:8px;line-height:1.8;">
                 배우자 출산휴가 발생 ${Number(balance.spouseBirthGenerated || 0)}일 /
                 사용 ${Number(balance.spouseBirthUsed || 0)}일 /
                 잔여 <strong>${Number(balance.spouseBirthRemain || 0)}일</strong>
               </div>`
            : ""
        }
      `;
      summary.classList.add("show");
    }

    if (!rows.length) {
      list.innerHTML =
        '<div class="item">' +
        year +
        '년에 등록된 연월차 신청·사용내역이 없습니다.</div>';
      return;
    }

    list.innerHTML =
      '<div class="item" style="font-weight:900;font-size:17px;">' +
      year +
      '년 사용내역</div>' +
      rows.map(renderLeaveHistoryItem).join("");

  } catch (error) {
    if (summary) {
      summary.innerHTML = error.message || "조회 중 오류가 발생했습니다.";
      summary.classList.add("show");
    }
    list.innerHTML =
      '<div class="item">' +
      (error.message || "조회 중 오류가 발생했습니다.") +
      "</div>";
  }
}


function renderLeaveHistoryItem(row) {
  const status = String(row["상태"] || "대기").trim();
  const leaveType = row["휴가종류"] || row["휴가구분"] || "-";
  const days = Number(row["사용일수"] || row["일수"] || 0);

  const start = formatDate(row["시작일"]);
  const end = formatDate(row["종료일"]);

  const shortStart = start && start !== "-" ? start.substring(5) : "-";
  const shortEnd = end && end !== "-" ? end.substring(5) : "-";

  const period =
    shortStart === shortEnd
      ? shortStart
      : shortStart + " ~ " + shortEnd;

  return `
    <div class="item" style="padding:10px 12px;">
      <div style="
        display:flex;
        flex-wrap:wrap;
        align-items:center;
        gap:7px;
        font-size:15px;
        line-height:1.7;
      ">
        <strong>${period}</strong>
        <span>|</span>
        <span>${leaveType}</span>
        <span>|</span>
        <span>${days}일</span>
        <span>|</span>
        ${renderStatusBadge(status)}
      </div>
      ${
        row["사유"]
          ? `<div style="margin-top:3px;color:#6b7280;font-size:13px;">
               ${row["사유"]}
             </div>`
          : ""
      }
    </div>
  `;
}


/* =========================
   미휴무 잔여 조회
========================= */

async function checkCompBalance() {

  if (!verifyCompEmployee()) {
    return;
}  
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
  pin: $("compPin").value.trim(),
  workDate: $("extraWorkDate").value,
  days: Number($("extraDays").value || 0),
  reason: $("extraReason").value.trim()
};

  if (
  !data.store ||
  !data.name ||
  !data.phone ||
  !data.pin ||
  !data.workDate ||
  data.days <= 0
) {
    showMessage(
      "extraResult",
      "근무지, 이름, 연락처, PIN, 추가근무일, 발생일수를 입력하세요."
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
  pin: $("compPin").value.trim(),
  useDate: $("compUseDate").value,
  days: Number($("compUseDays").value || 0),
  reason: $("compUseReason").value.trim()
};

  if (
  !data.store ||
  !data.name ||
  !data.phone ||
  !data.pin ||
  !data.useDate ||
  data.days <= 0
) {
    showMessage(
      "compUseResult",
      "근무지, 이름, 연락처, PIN, 사용 예정일, 사용일수를 입력하세요."
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

  if (!verifyCompEmployee()) {
    return;
}  
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
  store: $("compStore").value,
  name: name,
  phone: phone,
  pin: $("compPin").value.trim(),
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
function verifyEmployee() {

  const store = $("store").value;
  const name = $("name").value.trim();
  const phone = $("phone").value.trim();
  const pin = $("pin").value.trim();

  if (
    !store ||
    !name ||
    !phone ||
    !pin
  ) {

    showMessage(
      "result",
      "근무지, 이름, 연락처, PIN을 입력하세요."
    );

    return false;
  }

  employeeVerified = true;

  return true;
}


function verifyCompEmployee() {

  const store = $("compStore").value;
  const name = $("compName").value.trim();
  const phone = $("compPhone").value.trim();
  const pin = $("compPin").value.trim();

  if (
    !store ||
    !name ||
    !phone ||
    !pin
  ) {

    showMessage(
      "compUseResult",
      "근무지, 이름, 연락처, PIN을 입력하세요."
    );

    return false;
  }

  return true;
}

/* =========================
   연월차 사용내역 조회년도
========================= */
function initializeHistoryYear() {
  const select = $("historyYear");
  if (!select) return;

  const currentYear = new Date().getFullYear();
  const startYear = Math.max(2020, currentYear - 6);
  select.innerHTML = "";

  for (let year = currentYear; year >= startYear; year--) {
    const option = document.createElement("option");
    option.value = String(year);
    option.textContent = year + "년";
    select.appendChild(option);
  }

  select.value = String(currentYear);
}

document.addEventListener("DOMContentLoaded", initializeHistoryYear);
