import re
import pdfplumber

class TranscriptParser:
    def __init__(self):
        # Dönem son eklerini Türkçe karşılıklarıyla haritalıyoruz
        self.term_suffix_map = {
            "1": "Güz Dönemi",
            "2": "Bahar Dönemi",
            "3": "Yaz Dönemi"
        }

    def format_term_name(self, raw_term):
        """'2023/2024-1' formatını '2023 - 2024 Güz Dönemi'ne çevirir."""
        match = re.search(r"(\d{4})/(\d{4})-(\d)", raw_term)
        if match:
            y1, y2, t = match.groups()
            suffix = self.term_suffix_map.get(t, "Bilinmeyen Dönem")
            return f"{y1} - {y2} {suffix}"
        return raw_term

    def parse_transcript(self, pdf_stream):
        """
        PDF içeriğini okur, doğrular ve hiyerarşik JSON verisi üretir.
        Girdi: PDF dosya objesi veya yolu.
        """
        full_text = ""
        with pdfplumber.open(pdf_stream) as pdf:
            for page in pdf.pages:
                full_text += page.extract_text() + "\n"

        # Doğrulama (Safe Zone): Belge gerçekten bir transkript mi?
        if "BOĞAZİÇİ UNIVERSITY" not in full_text:
            return {"error": "Geçersiz dosya. Bu bir Boğaziçi transkripti değil."}

        # 1. Öğrenci Bilgilerini Ayıklama
        student_no = re.search(r"STUDENT NUMBER\s*:\s*(\d+)", full_text).group(1)
        # İsim ve soyisimi çekerken satır sonu boşluklarını temizliyoruz
        first_name = re.search(r"FIRST NAME\s*:\s*(.+)", full_text).group(1).strip()
        last_name = re.search(r"LAST NAME\s*:\s*(.+)", full_text).group(1).strip()

        data = {
            "ogrenci_bilgileri": {
                "ogrenci_no": student_no,
                "ad_soyad": f"{first_name} {last_name}".upper()
            },
            "donemler": [],
            "genel_gpa": 0.0
        }

        # 2. Dönemlere Bölme ve İşleme
        # Dönem başlangıçlarını yakalamak için (Örn: 2023/2024-1)
        term_blocks = re.split(r"(\d{4}/\d{4}-\d)", full_text)
        
        # Split sonrası ilk eleman metadata olduğu için geçiyoruz, 
        # sonrakiler [dönem_adı, dönem_içeriği] şeklinde ikili gruplar halindedir.
        for i in range(1, len(term_blocks), 2):
            raw_term_name = term_blocks[i]
            term_content = term_blocks[i+1]
            
            current_term = {
                "donem_adi": self.format_term_name(raw_term_name),
                "dersler": [],
                "donem_spa": 0.0,
                "donem_sonu_gpa": 0.0
            }

            # Ders Satırı Yakalama Regex'i:
            # Grup 1: Bölüm (CMPE), Grup 2: Kod (150), Grup 3: Ders Adı, 
            # Grup 4: Kredi, Grup 5: ECTS, Grup 6: Not, Grup 7: Repeat durumu (Opsiyonel)
            course_regex = r"([A-Z]{2,4}|[A-Z]{2}\s\d{3})\s*(\d{3}[A-Z]?)\s+(.*?)\s+(\d+\.\d+)\s+(\d+\.\d+)\s+([A-Z\+\-]+)\s*([R]?)?"
            
            courses = re.findall(course_regex, term_content)
            for c in courses:
                current_term["dersler"].append({
                    "bolum": c[0].strip(),
                    "kod": c[1],
                    "ad": c[2].strip().upper(),
                    "kredi": float(c[3]),
                    "harf_notu": c[5],
                    "durum": "Repeat" if c[6] == "R" else ("Withdrawal" if c[5] == "W" else "Normal")
                })

            # Dönem İstatistiklerini Yakalama (SPA ve Kümülatif GPA)
            spa_match = re.search(r"SPA\s*:\s*(\d+\.\d+)", term_content)
            gpa_at_term_match = re.search(r"GPA\s*:\s*(\d+\.\d+)", term_content)
            
            if spa_match:
                current_term["donem_spa"] = float(spa_match.group(1))
            if gpa_at_term_match:
                current_term["donem_sonu_gpa"] = float(gpa_at_term_match.group(1))

            data["donemler"].append(current_term)

        # 3. Genel GPA (Belgenin en sonundaki en güncel değer)
        # 'GPA: 1.54' gibi son eşleşmeyi alır.
        all_gpas = re.findall(r"GPA\s*:\s*(\d+\.\d+)", full_text)
        if all_gpas:
            data["genel_gpa"] = float(all_gpas[-1])

        return data