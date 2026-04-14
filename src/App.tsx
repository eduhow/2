import A4Template from "@/components/A4Template";

function App() {
  // 1. Vite'ı kandırmak ve derleme boyutunu değiştirmek için bir log ekliyoruz
  console.log("GitHub Actions Güncelleme Testi - Sürüm 2.0");

  return (
    <>
      {/* 2. Ekranda görünmeyen ama HTML yapısını değiştiren bir element ekliyoruz */}
      <div style={{ display: 'none', position: 'absolute' }}>
        Sistem Tetikleme V2.0 - {new Date().toISOString()}
      </div>
      
      <A4Template />
    </>
  );
}

export default App;
