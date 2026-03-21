# smartparkingapp

<p align="center">
  <img src="assets/logo.png" alt="SmartParkingApp logo" width="200">
</p>

[![Android](https://img.shields.io/badge/Android-3DDC84?logo=android&logoColor=white)]()
[![React Native](https://img.shields.io/badge/React_Native-61DAFB?logo=react&logoColor=white)]()
[![Supabase](https://img.shields.io/badge/Supabase-3FCF8E?logo=supabase&logoColor=white)]()

> Ứng dụng giữ xe bằng điện thoại — nhận diện biển số, quản lý ra/vào, đồng bộ offline.

---

## Tính năng

- Nhận diện biển số xe (LPR) trên thiết bị — ONNX Runtime
- Quét NFC để xuất/vào nhanh
- Hoạt động offline — SQLite + đồng bộ background
- Đăng nhập, quên mật khẩu qua email
- Dashboard thống kê phiên, xuất Excel
- Camera real-time với frame processor

---

## Cấu trúc thư mục

```
smartparkingapp/
├── core/                          # React Native mobile app
│   ├── android/                   # Native Android (Kotlin)
│   └── src/                       # TypeScript screens/components
├── server/                        # Supabase backend
│   └── supabase/
│       ├── functions/             # Edge Functions (Deno)
│       └── migrations/            # Database migrations
├── assets/
│   └── logo.png
└── README.md
```

---

## Tech Stack

| Layer | Công nghệ |
|---|---|
| Mobile | React Native 0.85, TypeScript, Kotlin |
| LPR Engine | ONNX Runtime (trên thiết bị) |
| Local DB | SQLite (Android native) |
| Backend | Supabase (PostgreSQL, Auth, Storage) |
| Edge Functions | Deno / TypeScript |

---

## Tác giả

**tpc-pascal** — [GitHub](https://github.com/tpc-pascal)

---

## License

MIT
