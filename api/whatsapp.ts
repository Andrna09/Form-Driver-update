import type { VercelRequest, VercelResponse } from '@vercel/node';
import https from 'https';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // 1. CORS Headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method Not Allowed' });

  // 2. Cek Token
  const token = process.env.FONNTE_TOKEN;
  if (!token) {
    console.error('❌ FONNTE_TOKEN tidak ditemukan di environment variables');
    return res.status(500).json({ 
      status: false, 
      message: 'FONNTE_TOKEN missing. Set token di Vercel Environment Variables.' 
    });
  }

  const { target, message, url, filename } = req.body || {};
  
  // Validasi input lebih ketat
  if (!target) {
    return res.status(400).json({ 
      status: false,
      message: 'Target number required' 
    });
  }
  
  if (!message) {
    return res.status(400).json({ 
      status: false,
      message: 'Message required' 
    });
  }

  // ==========================================
  // 3. LOGIKA FORMAT NOMOR (PERBAIKAN)
  // ==========================================
  let formattedTarget = target.toString().trim();

  console.log('📱 Original target:', formattedTarget);

  // Cek apakah ini GRUP (@g.us atau @c.us)
  if (formattedTarget.includes('@g.us') || formattedTarget.includes('@c.us')) {
    // Jangan ubah format grup
    console.log('👥 Terdeteksi sebagai grup, format tidak diubah');
  } else {
    // Untuk nomor HP biasa
    // Hapus semua karakter non-digit
    formattedTarget = formattedTarget.replace(/[^0-9]/g, '');
    
    // Hapus leading zeros (misal 0812 -> 812)
    formattedTarget = formattedTarget.replace(/^0+/, '');
    
    // Tambahkan country code Indonesia jika belum ada
    if (!formattedTarget.startsWith('62')) {
      formattedTarget = '62' + formattedTarget;
    }
    
    // Validasi panjang nomor Indonesia (62 + 9-12 digit)
    if (formattedTarget.length < 11 || formattedTarget.length > 15) {
      console.warn('⚠️ Panjang nomor mencurigakan:', formattedTarget);
    }
    
    console.log('📞 Formatted target:', formattedTarget);
  }
  // ==========================================

  const payload = {
    target: formattedTarget,
    message: message,
    ...(url && { url }),
    ...(filename && { filename })
  };

  const data = JSON.stringify(payload);

  const options = {
    hostname: 'api.fonnte.com',
    port: 443,
    path: '/send',
    method: 'POST',
    headers: {
      'Authorization': token,
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(data)
    },
    timeout: 30000 // 30 detik timeout
  };

  console.log('📤 Sending to Fonnte:', { target: formattedTarget, messageLength: message.length });

  try {
    const result: any = await new Promise((resolve, reject) => {
      const request = https.request(options, (response) => {
        let body = '';
        
        response.on('data', (chunk) => {
          body += chunk;
        });
        
        response.on('end', () => {
          console.log('📥 Fonnte response status:', response.statusCode);
          console.log('📥 Fonnte response body:', body);
          
          try {
            const parsed = JSON.parse(body);
            
            // Cek jika Fonnte mengembalikan error atau status bukan 200
            if (parsed.status === false || (response.statusCode && response.statusCode !== 200)) {
              reject(new Error(parsed.reason || parsed.message || 'Fonnte API error'));
            } else {
              resolve(parsed);
            }
          } catch (parseError) {
            console.error('❌ Parse error:', parseError);
            reject(new Error('Invalid JSON response from Fonnte'));
          }
        });
      });

      request.on('error', (e) => {
        console.error('❌ Request error:', e);
        reject(e);
      });

      request.on('timeout', () => {
        console.error('❌ Request timeout');
        request.destroy();
        reject(new Error('Request timeout'));
      });

      request.write(data);
      request.end();
    });

    console.log('✅ Message sent successfully');
    return res.status(200).json({
      status: true,
      ...result
    });
    
  } catch (e: any) {
    console.error('❌ Error sending message:', e);
    
    return res.status(500).json({ 
      status: false, 
      message: 'Failed to send WhatsApp message',
      error: e.message,
      details: 'Check Vercel logs for more information'
    });
  }
}
