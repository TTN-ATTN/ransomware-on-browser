# Chú ý
- Chạy local trước, docker chưa build xong ._.

# Backend
- Chạy `npm install` để cài package trước => Xuất hiện thư mục node_modules/
- Chạy `npm run start` để chạy backend (api handle) port 4000

# Frontend
- Chạy `npm install` để cài package trước => Xuất hiện thư mục node_modules/
- Chạy `npm run build` để compile và build bằng webpack => Xuất hiện thư mục dist/ (Chạy cái này thì sẽ có 3-4 warning, không cần quan tâm tới)
- Chạy `npx server dist` để host web port 3000 (thư mục dist/)

# Hiện tại mới làm
- User truy cập vào web thì frontend gửi req về backend lấy clientid (random)
- Frontend sử dụng generate key, mã hóa file = AES-256-GCM.
- Frontend sau đó gửi key lại về backend, backend lưu clientid + key + 1 vài thông tin nhí nhố vô db (sqlite3)

# Chưa làm (thứ tự ưu tiên)
- Backend ban đầu cần vừa gen clientid, gen rsa keypair, gửi đến frontend là clientid + public key
- Frontend gửi key AES về backend thì phải encrypt lại bằng public key trên
- Backend phải dùng private key để decrypt ra AES key.
- Build docker, setup HTTPS và test ở ngoài xem có chạy được không (Những thứ trên đây đều chỉ test ở localhost)
- Dự kiến up lên cloud nếu oke ._.

Nếu làm được những cái trên và test OK hết rồi thì tính tới những cái sau đây.
- Giao diện đẹp có thể đi lừa đảo
- Ransom page để redirect sau khi mã hóa tất cả các file
- Dashboard ở phía backend để xem thông tin clientid blabla... Nói chung là từ cái sqlites3 hiển thi lên dashboard cho đẹp

# Tech
- Frontend: có 2 module chính là FSA api (file system access api) + crypto module (dùng như paper đang dùng enigma lib) => Phải build bằng webpack (vì chỉ có nó hỗ trợ TT.TT)
- Backend: các api handle, trong đó crypto có thể dùng native crypto api, không cần dùng enigma.