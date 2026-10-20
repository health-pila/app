/* 이용권·결제: 서비스 추가 시 이 목록의 이름·안내·이미지·주소만 추가합니다. */
(() => {
  "use strict";
  const grid = document.getElementById("memberServicesGrid");
  if (!grid) return;

  const SERVICES = [
    {
      name: "헬스회원권 재등록",
      caption: "헬스회원권 결제",
      image: "images/service-renewal.webp",
      url: "https://m.booking.naver.com/booking/13/bizes/779936/items/7127162"
    },
    {
      name: "락커 연장",
      caption: "개인락커 결제",
      image: "images/service-locker.webp",
      url: "https://booking.naver.com/booking/13/bizes/779936/items/6415132"
    },
    {
      name: "운동복 500원",
      caption: "운동복 1회 대여",
      image: "images/service-clothing.webp",
      url: "https://m.booking.naver.com/booking/13/bizes/779936/items/7151381"
    },
    {
      name: "생수 100원",
      caption: "냉장 생수 결제",
      image: "images/service-water.webp",
      url: "https://m.booking.naver.com/booking/13/bizes/779936/items/6964452"
    },
    {
      name: "필라테스 체험",
      caption: "필테 체험 20,000원",
      image: "images/service-pilates-trial.webp",
      url: "https://booking.naver.com/booking/13/bizes/779936/items/5241892"
    },
    {
      name: "토요 무료 헬스 강좌",
      caption: "무료로 헬스 배우기",
      image: "images/service-free-class.webp",
      url: "https://booking.naver.com/booking/13/bizes/779936/items/7204368"
    }
  ];

  function createServiceCard(service) {
    const item = document.createElement("div");
    item.className = "member-service-item";
    const link = document.createElement("a");
    link.className = "member-service-card";
    link.href = service.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.setAttribute("aria-label", service.name);

    const media = document.createElement("div");
    media.className = "member-service-media";
    const image = document.createElement("img");
    image.src = service.image;
    image.alt = service.name;
    image.width = 512;
    image.height = 512;
    image.loading = "lazy";
    image.decoding = "async";
    media.append(image);
    const caption = document.createElement("div");
    caption.className = "member-service-caption";
    const label = document.createElement("span");
    label.className = "member-service-caption-text";
    label.textContent = service.caption;
    const arrow = document.createElement("span");
    arrow.className = "member-service-arrow";
    arrow.setAttribute("aria-hidden", "true");
    caption.append(label, arrow);
    link.append(media, caption);
    item.append(link);
    return item;
  }

  grid.replaceChildren(...SERVICES.map(createServiceCard));
})();
