from flask import Flask, request, jsonify
from flask_cors import CORS
import io
from pdfextraction import TranscriptParser

app = Flask(__name__)
CORS(app)

parser = TranscriptParser()

@app.route('/api/v1/parse', methods=['POST'])
def parse_pdf():
    # 1. Dosya kontrolü (Guard Clause)
    if 'file' not in request.files:
        return jsonify({"error": "Dosya bulunamadı"}), 400
    
    file = request.files['file']
    
    if file.filename == '' or not file.filename.endswith('.pdf'):
        return jsonify({"error": "Lütfen geçerli bir PDF yükleyin"}), 400

    try:
        # 2. Dosyayı diske kaydetmeden bellekte (memory) oku
        pdf_content = io.BytesIO(file.read())
        
        # 3. Parser'ı çalıştır
        result = parser.parse_transcript(pdf_content)
        
        # 4. Eğer parser hata döndürdüyse (Doğrulama hatası gibi)
        if "error" in result:
            return jsonify(result), 422

        return jsonify(result), 200

    except Exception as e:
        return jsonify({"error": f"Sunucu hatası: {str(e)}"}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000)