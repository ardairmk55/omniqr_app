# OmniQR Studio

## Türkçe

OmniQR Studio, baskı provası estetiğini QR üretimiyle buluşturan gizlilik odaklı bir web atölyesidir. Türkçe ve İngilizce arayüz, 11 içerik ailesi, renk/modül biçimi/hata düzeltme kontrolleri, PNG indirme, yerel favoriler ve çevrimdışı uygulama kabuğu sunar.

### Yerel kurulum

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python tools/generate_icons.py
flask --app app:create_app run
```

Uygulama `http://127.0.0.1:5000` adresinde açılır. Tailwind kaynakları için `npm install` ve `npm run build:css` kullanın. Geliştirme kontrolleri: `pip install -r requirements-dev.txt`, `pytest`, `ruff check app tests tools`. Görsel tarayıcı QA'sı için `npm run qa:screens` komutunu çalıştırın; Playwright yalnızca geliştirme bağımlılığıdır.

### Logo ve markalama

`logo-source.png` veya `logo-source.svg` dosyasını `app/static/brand/` içine koyun. Simge üreticisi önce bu klasörü, sonra `app/static` altındaki `logo-source.*` dosyalarını arar. Mevcut PNG dosyası kök statik klasördedir. SVG kaynak kullanmak için geliştirme ortamında `pip install cairosvg` ekleyin. İkonları ve sosyal paylaşım kartını `python tools/generate_icons.py` ile yeniden üretin. Komut; favicon boyutlarını ve ICO'yu, Apple Touch ve PWA/maskable ikonlarını, koyu tema işaretini ve OG kartını oluşturur.

### Üretim ve dağıtım

`SECRET_KEY` ve `FLASK_ENV=production` değerlerini ortamda tanımlayın; Linux'ta `gunicorn -w 2 -b 0.0.0.0:8000 'app:create_app()'` veya `docker build -t omniqr-studio .` / `docker run -p 8000:8000 omniqr-studio` komutlarını kullanın. HTTPS, HSTS için gereklidir.

### PWA yükleme

HTTPS üzerinden siteyi açın. Android Chrome ve masaüstü Chrome/Edge yükleme önerisi gösterir. iPhone/iPad Safari'de paylaş menüsünden “Ana Ekrana Ekle”yi seçin. İlk açılıştan sonra uygulama kabuğu önbelleğe alınır.

### Mimari ve gizlilik

`app/routes` sayfa/API uçlarını, `app/services` payload/validasyon/QR motorunu, `app/templates` HTML'yi, `app/static` tasarım ve istemci modüllerini içerir. İçerik QR üretimi için aynı kaynaklı API'ye iletilir ve sunucuda kalıcı olarak tutulmaz. Hesap, analitik ve üçüncü taraf servis çağrısı yoktur.

### Ekran görüntüleri

`docs/screenshots/` klasöründe Playwright tarafından oluşturulan görünüm örnekleri bulunur. Yenilemek ve taşma/temas hedefi/console kontrollerini çalıştırmak için `npm run qa:screens` kullanın.

### Sınırlar

Mevcut sürüm Pillow ile PNG üretir. SVG, PNG, JPEG, WebP ve PDF dışa aktarımları sunulur; logo/gradient çizimi, QR tarayıcı, çevrimdışı QR üretimi, CSV arşivi ve gelişmiş okunabilirlik analizi uygulanmamıştır. Çevrimdışı durumda uygulama kabuğu ve offline sayfası kullanılabilir; API tabanlı QR üretimi bağlantı gerektirir.

## English

OmniQR Studio is a privacy-minded QR workshop with a print-proof visual identity. It includes Turkish and English UI, 11 payload families, color/module/error-correction controls, PNG/SVG/JPEG/WebP/PDF exports, a custom logo and PWA icon set, local favorites, and a responsive app shell.

### Local setup

```sh
python -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
python tools/generate_icons.py
flask --app app:create_app run
```

Open `http://127.0.0.1:5000`. For Tailwind source builds, run `npm install` then `npm run build:css`. Development checks: `pip install -r requirements-dev.txt`, `pytest`, and `ruff check app tests tools`. Run responsive screenshot QA with `npm run qa:screens`; Playwright is a development dependency only.

### Logo and branding

Place `logo-source.png` or `logo-source.svg` in `app/static/brand/`. The generator checks that folder first, then searches `app/static` for `logo-source.*`. The current PNG source is in the static folder. SVG inputs require `pip install cairosvg`. Regenerate icons and the social card with `python tools/generate_icons.py`. It creates the favicon sizes/ICO, Apple touch icon, PWA and maskable icons, light/dark marks, and OG image.

### Production and deployment

Set `SECRET_KEY` and `FLASK_ENV=production`. On Linux run `gunicorn -w 2 -b 0.0.0.0:8000 'app:create_app()'`, or build and run the included Dockerfile. HTTPS is required for HSTS and PWA installation.

### Install the PWA

Open the HTTPS site. Android Chrome and desktop Chrome/Edge provide an install prompt. On iOS Safari, use Share > Add to Home Screen. The app shell is cached after the first visit.

### Architecture and privacy

Routes are in `app/routes`, payload validation and QR rendering in `app/services`, templates in `app/templates`, and client assets in `app/static`. Content is sent to the same-origin API for rendering and is not persistently stored. There are no accounts, analytics, or third-party service calls.

### Screenshots

See the Playwright screenshots in `docs/screenshots/`. Regenerate them and run overflow/tap-target/console checks with `npm run qa:screens`.

### Current limitations

PNG/JPEG/WebP/PDF raster exports and true vector SVG are supported. Logo/gradient rendering, scanner, offline QR generation, CSV archive, and advanced scan analysis remain unimplemented. The offline app shell and offline page are available, but QR generation needs a connection.
