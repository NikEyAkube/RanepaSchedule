import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import { google } from 'googleapis';
import path from 'path';
import natural from 'natural';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const tokenizer = new natural.WordTokenizer();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// Настройка Google Sheets API
let auth;
if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  try {
    auth = new google.auth.GoogleAuth({
      credentials: JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS),
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });
  } catch (error) {
    console.error('Error parsing GOOGLE_APPLICATION_CREDENTIALS:', error);
    process.exit(1);
  }
} else {
  console.error('GOOGLE_APPLICATION_CREDENTIALS is not defined in .env file');
  process.exit(1);
}

const sheets = google.sheets({ version: 'v4', auth });

// Чтение spreadsheetId из переменной окружения
const spreadsheetId = process.env.SPREADSHEET_ID;

app.post('/api/schedule', async (req, res) => {
  console.log('Received request:', req.body);
  try {
    const { question } = req.body;
    console.log('Processing question:', question);
    
    const questionParts = question.toLowerCase().split(' ');
    let group, day, month;

    // Функция для получения текущей даты в московском времени
    function getMoscowDate() {
      const now = new Date();
      return new Date(now.toLocaleString("en-US", {timeZone: "Europe/Moscow"}));
    }

    if (questionParts[0] === 'сегодня' || questionParts[0] === 'завтра') {
      group = 'БИ-3-21-01';
      const date = getMoscowDate();
      if (questionParts[0] === 'завтра') {
        date.setDate(date.getDate() + 1);
      }
      day = date.getDate();
      month = date.getMonth() + 1;
    } else if (questionParts[0] === 'би-3-21-01') {
      group = 'БИ-3-21-01';
      if (questionParts[1] === 'сегодня') {
        const today = getMoscowDate();
        day = today.getDate();
        month = today.getMonth() + 1;
      } else if (questionParts[1] === 'завтра') {
        const tomorrow = getMoscowDate();
        tomorrow.setDate(tomorrow.getDate() + 1);
        day = tomorrow.getDate();
        month = tomorrow.getMonth() + 1;
      } else if (questionParts.length >= 3) {
        day = parseInt(questionParts[1], 10);
        month = getMonthNumber(questionParts[2]);
      } else {
        throw new Error('Неверный формат запроса. Используйте "БИ-3-21-01 сегодня", "БИ-3-21-01 завтра" или "БИ-3-21-01 [день] [месяц]"');
      }
    } else if (questionParts.length >= 3) {
      group = questionParts[0].toUpperCase();
      day = parseInt(questionParts[1], 10);
      month = getMonthNumber(questionParts[2]);
    } else {
      throw new Error('Неверный формат запроса. Пожалуйста, используйте формат "Группа День Месяц", "БИ-3-21-01 сегодня/завтра" или просто "сегодня/завтра"');
    }

    console.log(`Parsed request: Group: ${group}, Day: ${day}, Month: ${month}`);

    let response;
    try {
      console.log('Attempting to fetch data from Google Sheets...');
      response = await sheets.spreadsheets.values.get({
        spreadsheetId: spreadsheetId, // Используем переменную окружения
        range: 'Sheet1!A1:K1000',
      });
      console.log('Google Sheets response received');
    } catch (error) {
      console.error('Error fetching data from Google Sheets:', error);
      throw new Error('Failed to fetch data from Google Sheets');
    }

    const rows = response.data.values;
    console.log('Received rows:', rows ? rows.length : 'No rows');
    
    if (!rows || rows.length === 0) {
      throw new Error('No data found in the spreadsheet');
    }

    const filteredRows = rows.slice(1).filter(row => {
      const rowGroup = row[4].toUpperCase();
      const rowDay = parseInt(row[1], 10);
      const rowMonth = parseInt(row[2], 10);
      
      console.log(`Comparing: ${rowGroup} with ${group}, ${rowDay} == ${day}, ${rowMonth} == ${month}`);
      return rowGroup.startsWith(group) && rowDay === day && rowMonth === month;
    });

    console.log('Filtered rows:', filteredRows.length);

    if (filteredRows.length === 0) {
      res.json({ answer: 'Извините, не удалось найти расписание по вашему запросу. Пожалуйста, проверьте правильность введенных данных.' });
    } else {
      const scheduleText = filteredRows.map(row => 
        `Дата: ${row[1]}.${row[2]}, Время: ${row[3]}, Группа: ${row[4]}, Тип занятия: ${row[5]}, Предмет: ${row[6]}, Преподаватель: ${row[8]}, Аудитория: ${row[9]}`
      ).join('\n');
      res.json({ answer: `Найдено расписание:\n${scheduleText}` });
    }
  } catch (error) {
    console.error('Error processing request:', error);
    res.status(500).json({ error: 'Произошла ошибка при обработке запроса.', details: error.message });
  }
});

function getMonthNumber(month) {
  const months = {
    'января': 1, 'февраля': 2, 'марта': 3, 'апреля': 4, 'мая': 5, 'июня': 6,
    'июля': 7, 'августа': 8, 'сентября': 9, 'октября': 10, 'ноября': 11, 'декабря': 12
  };
  return months[month.toLowerCase()] || parseInt(month, 10);
}

// Чтение порта из переменной окружения
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

// Обработка корневого маршрута
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Обработка всех остальных маршрутов
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

export default app;