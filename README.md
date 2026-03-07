# 📸 SnapCBZ

<details open>
<summary>🇬🇧 English</summary>

**SnapCBZ** is a powerful and elegant open-source desktop application designed to easily download, organize, and archive image galleries, mangas, and comics from the internet.

Developed with modern web technologies (Electron, React, Vite, Tailwind CSS), it offers a fluid, fast, and highly customizable interface.

---

## ✨ Main Features

### 📥 Two Download Modes
- **Manga/Comic Mode (.cbz):** Paste artist or gallery links. The application scans pages, filters content according to your preferred languages, downloads images, and automatically packages them into `.cbz` archives ready to be read.
- **Image Board Mode (Direct Images):** Paste Image Board tag links. The application downloads images directly and intelligently sorts them into folders by "Copyright" or "Character".

### ⚡ Performance & Multitasking
- Simultaneous downloads with an intelligent queue.
- Real-time progress bars (scan, download, extraction, conversion).
- Automatic duplicate management to avoid downloading the same file twice.

### 🎨 Interface & Customization
- **3 Themes:** Light, Dark, and Black (ideal for OLED screens).
- **Accent Colors:** Choose from several colors (Turquoise, Blue, Purple, Pink, Orange, Emerald) or define your own custom color.
- **Wallpapers:** Ability to add a custom background image for the light theme.

### 🌍 Multilingual
The interface is fully translated into 8 languages:
🇫🇷 French | 🇬🇧 English | 🇹🇷 Turkish | 🇩🇪 German | 🇪🇸 Spanish | 🇵🇹 Portuguese | 🇮🇹 Italian | 🇸🇦 Arabic

### 🔄 Automatic Updates
The application includes an automatic update system. A simple click on "Check for updates" downloads and installs the latest version available on GitHub.

---

## 💻 Supported Operating Systems

- **Windows** (10 / 11)
- **Linux** (Ubuntu, Debian, Fedora, Arch, etc.)
*(Note: macOS is not supported).*

---

## 🚀 Installation

### For Users (Recommended)
1. Go to the **[Releases](../../releases)** section of this GitHub repository.
2. **Windows:** Download and run the `.exe` file (Setup or Portable).
3. **Linux:** Download the `.AppImage` file (make it executable) or use the `.deb` / `.rpm` packages. An `install.sh` script is also provided in the source code.

### For Developers (Build from source)
Make sure you have [Node.js](https://nodejs.org/) installed on your machine.

```bash
# 1. Clone the repository
git clone https://github.com/davidharputoglu/SnapCBZ.git
cd SnapCBZ

# 2. Install dependencies
npm install

# 3. Run in development mode
npm run electron:dev

# 4. Build the application
npm run build:win    # To create the Windows executable
npm run build:linux  # To create the Linux executables
```

---

## ⚠️ Legal Disclaimer

**SnapCBZ** is an open-source software tool provided for educational and personal archiving purposes only.

By using this software, you agree to be solely responsible for your actions. The author of this software does not promote or endorse piracy. You must ensure that you have the necessary rights or explicit permission from the creators/copyright holders to download copyrighted works.

*Please refer to the `DISCLAIMER.md` file to read the full disclaimer in your language.*

---

## 📄 License

This project is licensed under the **MIT** license. See the `LICENSE` file for more details.

---
**Created with ❤️ by [David HARPUTOGLU](https://github.com/davidharputoglu)**

</details>

<details>
<summary>🇫🇷 Français</summary>

**SnapCBZ** est une application de bureau open-source puissante et élégante, conçue pour télécharger, organiser et archiver facilement des galeries d'images, des mangas et des comics depuis internet.

Développée avec les technologies web modernes (Electron, React, Vite, Tailwind CSS), elle offre une interface fluide, rapide et hautement personnalisable.

---

## ✨ Fonctionnalités Principales

### 📥 Deux Modes de Téléchargement
- **Mode Manga/Comic (.cbz) :** Collez des liens d'artistes ou de galeries. L'application scanne les pages, filtre les contenus selon vos langues préférées, télécharge les images et les empaquette automatiquement en archives `.cbz` prêtes à être lues.
- **Mode Image Board (Images Directes) :** Collez des liens de tags d'Image Boards. L'application télécharge les images directement et les classe intelligemment dans des dossiers par "Copyright" ou "Personnage".

### ⚡ Performances & Multitâche
- Téléchargements simultanés avec file d'attente intelligente.
- Barres de progression en temps réel (scan, téléchargement, extraction, conversion).
- Gestion automatique des doublons pour éviter de télécharger deux fois le même fichier.

### 🎨 Interface & Personnalisation
- **3 Thèmes :** Clair, Sombre, et Noir (idéal pour les écrans OLED).
- **Couleurs d'accentuation :** Choisissez parmi plusieurs couleurs (Turquoise, Bleu, Violet, Rose, Orange, Émeraude) ou définissez votre propre couleur personnalisée.
- **Fonds d'écran :** Possibilité d'ajouter une image de fond personnalisée pour le thème clair.

### 🌍 Multilingue
L'interface est entièrement traduite en 8 langues :
🇫🇷 Français | 🇬🇧 Anglais | 🇹🇷 Turc | 🇩🇪 Allemand | 🇪🇸 Espagnol | 🇵🇹 Portugais | 🇮🇹 Italien | 🇸🇦 Arabe

### 🔄 Mises à jour automatiques
L'application intègre un système de mise à jour automatique. Un simple clic sur "Vérifier les mises à jour" permet de télécharger et d'installer la dernière version disponible sur GitHub.

---

## 💻 Systèmes d'exploitation supportés

- **Windows** (10 / 11)
- **Linux** (Ubuntu, Debian, Fedora, Arch, etc.)
*(Note : macOS n'est pas supporté).*

---

## 🚀 Installation

### Pour les utilisateurs (Recommandé)
1. Allez dans la section **[Releases](../../releases)** de ce dépôt GitHub.
2. **Windows :** Téléchargez et exécutez le fichier `.exe` (Setup ou Portable).
3. **Linux :** Téléchargez le fichier `.AppImage` (le rendre exécutable) ou utilisez les paquets `.deb` / `.rpm`. Un script `install.sh` est également fourni dans le code source.

### Pour les développeurs (Compiler depuis les sources)
Assurez-vous d'avoir [Node.js](https://nodejs.org/) installé sur votre machine.

```bash
# 1. Cloner le dépôt
git clone https://github.com/davidharputoglu/SnapCBZ.git
cd SnapCBZ

# 2. Installer les dépendances
npm install

# 3. Lancer en mode développement
npm run electron:dev

# 4. Compiler l'application
npm run build:win    # Pour créer l'exécutable Windows
npm run build:linux  # Pour créer les exécutables Linux
```

---

## ⚠️ Avertissement Légal (Disclaimer)

**SnapCBZ** est un outil logiciel open-source fourni à des fins éducatives et d'archivage personnel uniquement. 

En utilisant ce logiciel, vous acceptez d'être l'unique responsable de vos actions. L'auteur de ce logiciel ne promeut ni ne cautionne le piratage. Vous devez vous assurer que vous possédez les droits nécessaires ou l'autorisation explicite des créateurs/ayants droit pour télécharger des œuvres protégées par le droit d'auteur. 

*Veuillez consulter le fichier `DISCLAIMER.md` pour lire l'avertissement complet dans votre langue.*

---

## 📄 Licence

Ce projet est sous licence **MIT**. Voir le fichier `LICENSE` pour plus de détails.

---
**Créé avec ❤️ par [David HARPUTOGLU](https://github.com/davidharputoglu)**

</details>

<details>
<summary>🇹🇷 Türkçe</summary>

**SnapCBZ**, internetten resim galerilerini, mangaları ve çizgi romanları kolayca indirmek, düzenlemek ve arşivlemek için tasarlanmış güçlü ve zarif, açık kaynaklı bir masaüstü uygulamasıdır.

Modern web teknolojileriyle (Electron, React, Vite, Tailwind CSS) geliştirilmiş olup akıcı, hızlı ve son derece özelleştirilebilir bir arayüz sunar.

---

## ✨ Temel Özellikler

### 📥 İki İndirme Modu
- **Manga/Çizgi Roman Modu (.cbz):** Sanatçı veya galeri bağlantılarını yapıştırın. Uygulama sayfaları tarar, içerikleri tercih ettiğiniz dillere göre filtreler, resimleri indirir ve okunmaya hazır `.cbz` arşivleri halinde otomatik olarak paketler.
- **Image Board Modu (Doğrudan Resimler):** Image Board etiket bağlantılarını yapıştırın. Uygulama resimleri doğrudan indirir ve bunları "Telif Hakkı" veya "Karakter"e göre akıllıca klasörlere ayırır.

### ⚡ Performans ve Çoklu Görev
- Akıllı kuyruk sistemi ile eşzamanlı indirmeler.
- Gerçek zamanlı ilerleme çubukları (tarama, indirme, çıkarma, dönüştürme).
- Aynı dosyayı iki kez indirmeyi önlemek için otomatik kopya yönetimi.

### 🎨 Arayüz ve Özelleştirme
- **3 Tema:** Açık, Koyu ve Siyah (OLED ekranlar için ideal).
- **Vurgu Renkleri:** Çeşitli renkler (Turkuaz, Mavi, Mor, Pembe, Turuncu, Zümrüt) arasından seçim yapın veya kendi özel renginizi belirleyin.
- **Duvar Kağıtları:** Açık tema için özel bir arka plan resmi ekleme imkanı.

### 🌍 Çok Dilli
Arayüz tamamen 8 dile çevrilmiştir:
🇫🇷 Fransızca | 🇬🇧 İngilizce | 🇹🇷 Türkçe | 🇩🇪 Almanca | 🇪🇸 İspanyolca | 🇵🇹 Portekizce | 🇮🇹 İtalyanca | 🇸🇦 Arapça

### 🔄 Otomatik Güncellemeler
Uygulama otomatik bir güncelleme sistemi içerir. "Güncellemeleri kontrol et" düğmesine basit bir tıklama, GitHub'da bulunan en son sürümü indirir ve yükler.

---

## 💻 Desteklenen İşletim Sistemleri

- **Windows** (10 / 11)
- **Linux** (Ubuntu, Debian, Fedora, Arch, vb.)
*(Not: macOS desteklenmemektedir).*

---

## 🚀 Kurulum

### Kullanıcılar İçin (Önerilen)
1. Bu GitHub deposunun **[Releases](../../releases)** bölümüne gidin.
2. **Windows:** `.exe` dosyasını (Kurulum veya Taşınabilir) indirin ve çalıştırın.
3. **Linux:** `.AppImage` dosyasını indirin (çalıştırılabilir yapın) veya `.deb` / `.rpm` paketlerini kullanın. Kaynak kodunda ayrıca bir `install.sh` betiği sağlanmıştır.

### Geliştiriciler İçin (Kaynaktan Derleme)
Makinenizde [Node.js](https://nodejs.org/)'in kurulu olduğundan emin olun.

```bash
# 1. Depoyu klonlayın
git clone https://github.com/davidharputoglu/SnapCBZ.git
cd SnapCBZ

# 2. Bağımlılıkları yükleyin
npm install

# 3. Geliştirme modunda çalıştırın
npm run electron:dev

# 4. Uygulamayı derleyin
npm run build:win    # Windows yürütülebilir dosyasını oluşturmak için
npm run build:linux  # Linux yürütülebilir dosyalarını oluşturmak için
```

---

## ⚠️ Yasal Uyarı (Disclaimer)

**SnapCBZ**, yalnızca eğitim ve kişisel arşivleme amacıyla sağlanan açık kaynaklı bir yazılım aracıdır.

Bu yazılımı kullanarak, eylemlerinizden yalnızca sizin sorumlu olduğunuzu kabul edersiniz. Bu yazılımın yazarı korsanlığı teşvik etmez veya onaylamaz. Telif hakkıyla korunan eserleri indirmek için yaratıcılardan/telif hakkı sahiplerinden gerekli haklara veya açık izne sahip olduğunuzdan emin olmalısınız.

*Tam uyarıyı kendi dilinizde okumak için lütfen `DISCLAIMER.md` dosyasına bakın.*

---

## 📄 Lisans

Bu proje **MIT** lisansı altındadır. Daha fazla ayrıntı için `LICENSE` dosyasına bakın.

---
**[David HARPUTOGLU](https://github.com/davidharputoglu) tarafından ❤️ ile oluşturuldu**

</details>
