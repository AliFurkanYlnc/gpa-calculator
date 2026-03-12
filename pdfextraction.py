import re
import pdfplumber

class TranscriptParser:
    def __init__(self):
        self.term_suffix_map = {
            "1": "Güz Dönemi",
            "2": "Bahar Dönemi",
            "3": "Yaz Dönemi"
        }

    def _clean_text(self, text):
            """CID kodlamalarını kaba kuvvet (brute-force) ile temizler."""
            # Hem büyük hem küçük harf varyasyonlarını doğrudan tanımlıyoruz
            replacements = {
                "(CID:248)": "İ", "(cid:248)": "İ",
                "(CID:247)": "I", "(cid:247)": "I",
                "(CID:220)": "Ü", "(cid:220)": "Ü",
                "(CID:222)": "Ş", "(cid:222)": "Ş",
                "(CID:214)": "Ö", "(cid:214)": "Ö",
                "(CID:199)": "Ç", "(cid:199)": "Ç",
                "(CID:286)": "Ğ", "(cid:286)": "Ğ",
                "(CID:252)": "ü", "(cid:252)": "ü",
                "(CID:254)": "ş", "(cid:254)": "ş",
                "(CID:246)": "ö", "(cid:246)": "ö",
                "(CID:231)": "ç", "(cid:231)": "ç",
                "(CID:287)": "ğ", "(cid:287)": "ğ",
                "(CID:253)": "ı", "(cid:253)": "ı"
            }
            for old, new in replacements.items():
                text = text.replace(old, new)
            return text

    def format_term_name(self, raw_term):
        match = re.search(r"(\d{4})/(\d{4})-(\d)", raw_term)
        if match:
            y1, y2, t = match.groups()
            suffix = self.term_suffix_map.get(t, "Bilinmeyen Dönem")
            return f"{y1} - {y2} {suffix}"
        return raw_term

    def parse_transcript(self, pdf_stream):
        full_text = ""
        with pdfplumber.open(pdf_stream) as pdf:
            for page in pdf.pages:
                text = page.extract_text(layout=True) or page.extract_text()
                full_text += text + "\n"

        # 1. Ön İşleme
        full_text = self._clean_text(full_text)

        # DÜZELTME: Sayfa başlıklarındaki ENTRANCE YEAR ibaresini metinden tamamen siliyoruz
        # Böylece ayrıştırıcı (parser) bunu yanlışlıkla bir dönem başlığı sanmıyor.
        full_text = re.sub(r"ENTRANCE\s+YEAR\s*:\s*\d{4}/\d{4}-\d", "", full_text)

        if "BOĞAZİÇİ UNIVERSITY" not in full_text and "BOGAZICI UNIVERSITY" not in full_text:
            return {"error": "Geçersiz dosya. Bu bir Boğaziçi transkripti değil."}
        try:
            # 2. Öğrenci Bilgilerini Ayıklama (Sütun taşmasını engellemek için split kullanıyoruz)
            student_no = re.search(r"STUDENT NUMBER\s*:\s*(\d+)", full_text).group(1)
            
            # FIRST NAME sonrasını al, STATUS yazan yerden böl ve sadece sol tarafı (ismi) temizle
            first_name_raw = re.search(r"FIRST NAME\s*:\s*(.+)", full_text).group(1)
            first_name = first_name_raw.split("STATUS")[0].strip()
            
            # LAST NAME sonrasını al, PROGRAM yazan yerden böl ve sadece sol tarafı (soyismi) temizle
            last_name_raw = re.search(r"LAST NAME\s*:\s*(.+)", full_text).group(1)
            last_name = last_name_raw.split("PROGRAM")[0].strip()

            data = {
                "ogrenci_bilgileri": {
                    "ogrenci_no": student_no,
                    "ad_soyad": f"{first_name} {last_name}".upper()
                },
                "donemler": [],
                "genel_gpa": 0.0
            }

            # 3. Dönemlere Bölme ve İşleme
            term_blocks = re.split(r"(\d{4}/\d{4}-\d)", full_text)
            
            # Regex kuralımızı dışarı alıyoruz ki her iki döngüde de kullanabilelim
            course_regex = re.compile(r"([A-Z]{2,5})\s*(\d{3}[A-Z]?)\s+(.+?)\s+(\d+\.\d+)\s+(\d+\.\d+)(?:\s+([A-Z]{1,2}[\+\-]?|W|S|U|NP|P|EX|NI|T))?\s*(R)?")

            # --- YENİ: Transfer Derslerini Yakalama ---
            # term_blocks[0], ilk normal dönem etiketinden önceki tüm metni barındırır.
            transfer_dersler = []
            for line in term_blocks[0].split('\n'):
                match = course_regex.search(line)
                if match:
                    c = match.groups()
                    harf = c[5] if c[5] is not None else "N/A"
                    transfer_dersler.append({
                        "bolum": c[0].strip(),
                        "kod": c[1],
                        "ad": c[2].strip().upper(),
                        "kredi": float(c[3]),
                        "harf_notu": harf,
                        "durum": "Transfer" # UI tarafında özel stil verebilmek için durum güncellendi
                    })

            if len(transfer_dersler) > 0:
                data["donemler"].append({
                    "donem_adi": "Transfer Edilen Dersler",
                    "dersler": transfer_dersler,
                    "donem_spa": 0.0,
                    "donem_sonu_gpa": 0.0
                })
            # -------------------------------------------
            
            # Normal dönemleri işlemeye devam et
            for i in range(1, len(term_blocks), 2):
                raw_term_name = term_blocks[i]
                term_content = term_blocks[i+1]
                current_term = {
                    "donem_adi": self.format_term_name(raw_term_name),
                    "dersler": [],
                    "donem_spa": 0.0,
                    "donem_sonu_gpa": 0.0
                }

                # DÜZELTME: Harf notu parantezinin başına (?: ve sonuna )? ekleyerek bu kısmı tamamen opsiyonel yaptık.
                course_regex = re.compile(r"([A-Z]{2,5})\s*(\d{3}[A-Z]?)\s+(.+?)\s+(\d+\.\d+)\s+(\d+\.\d+)(?:\s+([A-Z]{1,2}[\+\-]?|W|S|U|NP|P|EX|NI|T))?\s*(R)?")
                
                for line in term_content.split('\n'):
                    match = course_regex.search(line)
                    if match:
                        c = match.groups()
                        
                        # Eğer 6. grup (harf notu) PDF'te yoksa None döner. Biz bunu "N/A" işaretiyle değiştiriyoruz.
                        harf = c[5] if c[5] is not None else "N/A"
                        
                        current_term["dersler"].append({
                            "bolum": c[0].strip(),
                            "kod": c[1],
                            "ad": c[2].strip().upper(),
                            "kredi": float(c[3]),
                            "harf_notu": harf if harf != "R" else "N/A",
                            "durum": "Repeat" if c[6] == "R" or c[5] == "R" else ("Withdrawal" if harf == "W" else "Normal")
                        })

                # Dönem İstatistikleri
                spa_match = re.search(r"SPA\s*:\s*(\d+\.\d+)", term_content)
                gpa_at_term_match = re.search(r"GPA\s*:\s*(\d+\.\d+)", term_content)
                
                if spa_match:
                    current_term["donem_spa"] = float(spa_match.group(1))
                if gpa_at_term_match:
                    current_term["donem_sonu_gpa"] = float(gpa_at_term_match.group(1))

                data["donemler"].append(current_term)

            # 4. Genel GPA
            all_gpas = re.findall(r"GPA\s*:\s*(\d+\.\d+)", full_text)
            if all_gpas:
                data["genel_gpa"] = float(all_gpas[-1])

            return data
            
        except Exception as e:
            return {"error": f"Transkript ayrıştırma hatası: {str(e)}"}