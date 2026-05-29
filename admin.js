const API_URL =
  "https://script.google.com/macros/s/AKfycbx7Y5zaVU7kYTdFwdwhUgoKwqOGx55-8a0McZOmA42PpbU4WWJqYTFPeSH2oD4mOzd7/exec";

/* 신청목록 조회 */

async function loadRequests() {

  const password =
    document.getElementById("adminPw").value.trim();

  if (!password) {
    alert("관리자 비밀번호를 입력하세요.");
    return;
  }

  try {

    const btn =
      document.querySelector(".submit-btn");

    btn.disabled = true;
    btn.innerText = "조회 중...";

    const res = await fetch(API_URL, {
      method: "POST",
      body: JSON.stringify({
        action: "getAdminList",
        password: password
      })
    });

    const result = await res.json();

    if (!result.success) {
      alert(result.message);
      return;
    }

    renderList(result.rows || []);

  } catch (err) {

    console.log(err);

    alert("조회 실패");

  } finally {

    const btn =
      document.querySelector(".submit-btn");

    btn.disabled = false;
    btn.innerText = "신청내역 조회";

  }

}

/* 목록 렌더링 */

function renderList(rows) {

  const box =
    document.getElementById("requestList");

  box.innerHTML = "";

  if (!rows.length) {

    box.innerHTML = `
      <div class="card">
        신청내역이 없습니다.
      </div>
    `;

    return;
  }

  rows.reverse().forEach(item => {

    const status =
      item.status || "신청";

    let badgeClass = "";

    if (status === "승인") {
      badgeClass = "approve-badge";
    }

    if (status === "반려") {
      badgeClass = "reject-badge";
    }

    box.innerHTML += `

      <div class="card request-card">

        <div class="request-top">

          <div class="request-name">
            ${item.name}
          </div>

          <div class="badge ${badgeClass}">
            ${status}
          </div>

        </div>

        <div class="request-row">
          <strong>휴가구분</strong>
          <span>${item.leaveType}</span>
        </div>

        <div class="request-row">
          <strong>기간</strong>
          <span>
            ${item.startDate}
            ~
            ${item.endDate}
          </span>
        </div>

        <div class="request-row">
          <strong>사용일수</strong>
          <span>${item.days}일</span>
        </div>

        <div class="request-row">
          <strong>사유</strong>
          <span>${item.reason || "-"}</span>
        </div>

        <div class="request-row">
          <strong>신청일</strong>
          <span>${item.requestDate}</span>
        </div>

        <div class="admin-buttons">

          <button
            class="approve-btn"
            onclick="updateStatus(${item.rowId}, '승인')"
          >
            승인
          </button>

          <button
            class="reject-btn"
            onclick="updateStatus(${item.rowId}, '반려')"
          >
            반려
          </button>

        </div>

      </div>

    `;

  });

}

/* 승인 반려 */

async function updateStatus(rowId, status) {

  const password =
    document.getElementById("adminPw").value.trim();

  try {

    const res = await fetch(API_URL, {
      method: "POST",
      body: JSON.stringify({
        action: "updateLeaveStatus",
        rowId: rowId,
        status: status,
        password: password
      })
    });

    const result = await res.json();

    alert(result.message);

    loadRequests();

  } catch (err) {

    console.log(err);

    alert("처리 실패");

  }

}