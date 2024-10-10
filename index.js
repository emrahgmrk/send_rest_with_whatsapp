const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

// WhatsApp Client
const client = new Client({
    authStrategy: new LocalAuth()
});

client.on('qr', qr => {
    qrcode.generate(qr, { small: true });
    console.log('QR kodunu tarayın ve WhatsApp Web oturumunu açın.');
});

client.on('ready', () => {
    console.log('WhatsApp istemcisi hazır!');
});

// Fonksiyon: Metin dosyasını oku ve Ad Soyad - Numara - HTML yolu eşleştirmesi yap
function readContactsFile(filePath) {
    const contacts = {};
    const data = fs.readFileSync(filePath, 'utf8');
    const lines = data.split('\n');

    // Kullanıcının masaüstü yolunu dinamik olarak al
    const desktopPath = path.join('C:', 'Users', process.env.USERNAME, 'Desktop');

    lines.forEach(line => {
        const [name, number, htmlFilePath] = line.split(':').map(part => part.trim());
        if (name && number) {
            contacts[name] = {
                number: normalizePhoneNumber(number), // Telefon numarasını normalize et
                htmlFilePath: htmlFilePath ? path.join(desktopPath, htmlFilePath) : null   // Dosya yolunu masaüstünden itibaren ayarla
            };
        }
    });

    return contacts;
}

// Telefon numarasını normalize eden fonksiyon (başındaki + işaretini kaldırır)
function normalizePhoneNumber(number) {
    return number.replace(/\D/g, ''); // Numaranın sadece rakamlarını tutar
}

// Normalize string fonksiyonu: Boşlukları kaldır ve Türkçe karakterleri dönüştür
function normalizeString(str) {
    return str.toLowerCase()
        .replace(/\s+/g, '') // Tüm boşlukları kaldır
        .replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's')
        .replace(/ı/g, 'i').replace(/ç/g, 'c').replace(/ö/g, 'o'); // Türkçe karakterleri normalize et
}

// İki HTML dosyasında arama yapan fonksiyon
function searchInHtmlFiles(htmlFilePath1, htmlFilePath2, senderName, callback) {
    let resultFound = false;

    [htmlFilePath1, htmlFilePath2].forEach(filePath => {
        if (fs.existsSync(filePath)) {
            fs.readFile(filePath, 'utf8', (err, data) => {
                if (err) {
                    console.error(`Dosya okunamadı: ${err}`);
                    return;
                }

                console.log(`Dosya okunuyor: ${filePath}`);

                // cheerio ile HTML içeriğini parse et
                const $ = cheerio.load(data);
                let result = '';

                // HTML'deki satırı bul
                $('td').each((index, element) => {
                    let cellText = $(element).text().trim();
                    if (normalizeString(cellText) === normalizeString(senderName)) {
                        console.log(`Bulunan satır: ${cellText}`);
                        const row = $(element).closest('tr');
                        const columns = row.find('td'); 

                        const adSoyadText = columns.eq(1).text().trim();
                        const gorev = columns.eq(2).text().trim();
                        const izinTarihi = columns.eq(3).text().trim();
                        const kalanIzin = columns.eq(4).text().trim();

                        // Mesaj formatını oluştur
                        result += `*Adı Soyadı:* ${adSoyadText}\n`;
                        result += `*Görevi:* ${gorev}\n`;
                        result += `*Yıllık İzin Hakediş Tarihi:* ${izinTarihi}\n`;
                        result += `*Kalan İzin:* ${kalanIzin}\n\n`;

                        // Son Güncelleme Tarihi'ni al
                        const sonGuncellemeTarihi = $('p').filter(function() {
                            return $(this).text().includes('Son Güncelleme Tarihi');
                        }).text().trim();

                        result += `${sonGuncellemeTarihi}`;
                        callback(result);
                        resultFound = true;
                    }
                });

                if (!resultFound) {
                    console.log(`${senderName} bu dosyada bulunamadı: ${filePath}`);
                }
            });
        } else {
            console.log(`Dosya bulunamadı: ${filePath}`);
        }
    });
}

client.on('message', async message => {
    // Kişi mesaj attığında tetiklenecek kısım
    const contactsFilePath = path.join('C:', 'Users', process.env.USERNAME, 'Desktop', 'kemaliye', 'contacts.txt'); // Metin dosyasının yolunu ayarlayın
    const defaultHtmlFilePath1 = path.join('C:', 'Users', process.env.USERNAME, 'Desktop', 'kemaliye', 'htmlkemaliye', 'genel.html'); // Varsayılan kemaliye HTML dosyasının yolunu ayarlayın
    const defaultHtmlFilePath2 = path.join('C:', 'Users', process.env.USERNAME, 'Desktop', 'kemaliye', 'htmlyerkoy', 'genel.html'); // Varsayılan yerkoy HTML dosyasının yolunu ayarlayın

    // Metin dosyasından Ad Soyad ve Numara eşleştirmelerini oku
    const contacts = readContactsFile(contactsFilePath);

    // Mesajı atan kişinin numarasını alın
    const senderNumber = normalizePhoneNumber(message.from.replace('@c.us', ''));
    console.log(`Gönderen numara: ${senderNumber}`);

    // Gönderen numaraya karşılık gelen ismi bul
    const senderName = Object.keys(contacts).find(name => contacts[name].number === senderNumber);
    console.log(`SenderName: ${senderName}`);

    if (senderName) {
        const contact = contacts[senderName];
        const htmlFilePath1 = contact.htmlFilePath1 || defaultHtmlFilePath1;
        const htmlFilePath2 = contact.htmlFilePath2 || defaultHtmlFilePath2;

        console.log(`HTML Dosyası Yolu 1: ${htmlFilePath1}`);
        console.log(`HTML Dosyası Yolu 2: ${htmlFilePath2}`);

        // İki dosyada arama yap
        searchInHtmlFiles(htmlFilePath1, htmlFilePath2, senderName, async (result) => {
            if (result) {
                console.log(`Mesaj gönderiliyor: ${result}`);
                await client.sendMessage(message.from, result); // Mesajı gönderen kişiye yanıt gönder

                // Eğer kişiye özel bir HTML dosyası varsa, onu da gönder
                if (contact.htmlFilePath) {
                    console.log(`Kişiye özel HTML dosyası gönderiliyor: ${contact.htmlFilePath}`);
                    try {
                        const media = MessageMedia.fromFilePath(contact.htmlFilePath);
                        await client.sendMessage(message.from, media); // Kişiye dosyayı gönder
                    } catch (sendError) {
                        console.error('Dosya gönderilemedi:', sendError);
                    }
                }
            } else {
                console.log(`${senderName} HTML dosyasında bulunamadı.`);
            }
        });
    } else {
        console.log(`Gönderen numara bulunamadı: ${senderNumber}`);
    }
});

// WhatsApp Client'i başlat
client.initialize();
