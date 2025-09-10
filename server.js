const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const cors = require('cors');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(cors({
  origin: ['http://localhost:3000', 'https://your-frontend-domain.com'],
  credentials: true
}));

// Serve static files from public directory
app.use(express.static('public'));

// Database setup with proper error handling
const dbPath = path.join(__dirname, 'dpr_data.db');

class DPRDatabase {
  constructor() {
    this.db = null;
    this.initDatabase();
  }

  async initDatabase() {
    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(dbPath, (err) => {
        if (err) {
          console.error('Error opening database:', err);
          reject(err);
        } else {
          console.log('Connected to SQLite database');
          this.createTables().then(resolve).catch(reject);
        }
      });
    });
  }

  async createTables() {
    return new Promise((resolve, reject) => {
      const createTableSQL = `
        CREATE TABLE IF NOT EXISTS anggota_dpr (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          anggota INTEGER UNIQUE,
          link_foto TEXT,
          link_profil TEXT,
          nama TEXT NOT NULL,
          fraksi TEXT,
          dapil TEXT,
          akd_clean TEXT,
          ttl TEXT,
          agama TEXT,
          pendidikan TEXT,
          pekerjaan TEXT,
          organisasi TEXT,
          kota_lahir TEXT,
          usia INTEGER,
          pendidikan_terakhir TEXT,
          is_kader TEXT DEFAULT '0',
          is_dewan TEXT DEFAULT '0',
          usia_kategori TEXT,
          rank_partai INTEGER,
          partai TEXT,
          pendidikan_clean TEXT,
          organisasi_clean TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `;

      this.db.run(createTableSQL, (err) => {
        if (err) {
          console.error('Error creating table:', err);
          reject(err);
        } else {
          console.log('Table created or already exists');
          this.createIndexes().then(resolve).catch(reject);
        }
      });
    });
  }

  async createIndexes() {
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_nama ON anggota_dpr(nama)',
      'CREATE INDEX IF NOT EXISTS idx_fraksi ON anggota_dpr(fraksi)',
      'CREATE INDEX IF NOT EXISTS idx_partai ON anggota_dpr(partai)',
      'CREATE INDEX IF NOT EXISTS idx_dapil ON anggota_dpr(dapil)',
      'CREATE INDEX IF NOT EXISTS idx_pendidikan_terakhir ON anggota_dpr(pendidikan_terakhir)',
      'CREATE INDEX IF NOT EXISTS idx_agama ON anggota_dpr(agama)',
      'CREATE INDEX IF NOT EXISTS idx_usia ON anggota_dpr(usia)',
      'CREATE INDEX IF NOT EXISTS idx_composite_search ON anggota_dpr(nama, fraksi, partai, dapil)'
    ];

    return Promise.all(
      indexes.map(indexSQL => 
        new Promise((resolve, reject) => {
          this.db.run(indexSQL, (err) => {
            if (err) {
              console.error('Error creating index:', err);
              reject(err);
            } else {
              resolve();
            }
          });
        })
      )
    );
  }

  // Advanced search with pagination and filters
  async search(query, options = {}) {
    return new Promise((resolve, reject) => {
      const {
        limit = 25,
        offset = 0,
        sortBy = 'nama',
        sortOrder = 'ASC',
        filters = {}
      } = options;

      let sql = `SELECT * FROM anggota_dpr WHERE 1=1`;
      const params = [];

      // Search in multiple fields
      if (query) {
        const searchPattern = `%${query}%`;
        sql += ` AND (
          LOWER(nama) LIKE LOWER(?) 
          OR LOWER(fraksi) LIKE LOWER(?) 
          OR LOWER(partai) LIKE LOWER(?)
          OR LOWER(dapil) LIKE LOWER(?)
          OR LOWER(kota_lahir) LIKE LOWER(?)
          OR LOWER(pendidikan_terakhir) LIKE LOWER(?)
        )`;
        params.push(searchPattern, searchPattern, searchPattern, searchPattern, searchPattern, searchPattern);
      }

      // Apply filters
      if (filters.fraksi) {
        sql += ` AND LOWER(fraksi) LIKE LOWER(?)`;
        params.push(`%${filters.fraksi}%`);
      }
      if (filters.partai) {
        sql += ` AND LOWER(partai) LIKE LOWER(?)`;
        params.push(`%${filters.partai}%`);
      }
      if (filters.agama) {
        sql += ` AND agama = ?`;
        params.push(filters.agama);
      }
      if (filters.pendidikan) {
        sql += ` AND LOWER(pendidikan_terakhir) LIKE LOWER(?)`;
        params.push(`%${filters.pendidikan}%`);
      }
      if (filters.minUsia) {
        sql += ` AND usia >= ?`;
        params.push(filters.minUsia);
      }
      if (filters.maxUsia) {
        sql += ` AND usia <= ?`;
        params.push(filters.maxUsia);
      }

      // Sorting
      const validSortFields = ['nama', 'fraksi', 'partai', 'usia', 'created_at'];
      const sortField = validSortFields.includes(sortBy) ? sortBy : 'nama';
      const sortDir = sortOrder.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
      
      sql += ` ORDER BY ${sortField} ${sortDir}`;

      // Pagination
      sql += ` LIMIT ? OFFSET ?`;
      params.push(limit, offset);

      this.db.all(sql, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  // Get total count for pagination
  async getSearchCount(query, filters = {}) {
    return new Promise((resolve, reject) => {
      let sql = `SELECT COUNT(*) as count FROM anggota_dpr WHERE 1=1`;
      const params = [];

      if (query) {
        const searchPattern = `%${query}%`;
        sql += ` AND (
          LOWER(nama) LIKE LOWER(?) 
          OR LOWER(fraksi) LIKE LOWER(?) 
          OR LOWER(partai) LIKE LOWER(?)
          OR LOWER(dapil) LIKE LOWER(?)
          OR LOWER(kota_lahir) LIKE LOWER(?)
          OR LOWER(pendidikan_terakhir) LIKE LOWER(?)
        )`;
        params.push(searchPattern, searchPattern, searchPattern, searchPattern, searchPattern, searchPattern);
      }

      // Apply same filters as search
      if (filters.fraksi) {
        sql += ` AND LOWER(fraksi) LIKE LOWER(?)`;
        params.push(`%${filters.fraksi}%`);
      }
      if (filters.partai) {
        sql += ` AND LOWER(partai) LIKE LOWER(?)`;
        params.push(`%${filters.partai}%`);
      }
      if (filters.agama) {
        sql += ` AND agama = ?`;
        params.push(filters.agama);
      }
      if (filters.pendidikan) {
        sql += ` AND LOWER(pendidikan_terakhir) LIKE LOWER(?)`;
        params.push(`%${filters.pendidikan}%`);
      }
      if (filters.minUsia) {
        sql += ` AND usia >= ?`;
        params.push(filters.minUsia);
      }
      if (filters.maxUsia) {
        sql += ` AND usia <= ?`;
        params.push(filters.maxUsia);
      }

      this.db.get(sql, params, (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row.count);
        }
      });
    });
  }

  // Get member by ID
  async getMemberById(id) {
    return new Promise((resolve, reject) => {
      const sql = 'SELECT * FROM anggota_dpr WHERE id = ? OR anggota = ?';
      this.db.get(sql, [id, id], (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  }

  // Enhanced statistics
  async getStats() {
    return new Promise((resolve, reject) => {
      const queries = {
        total: 'SELECT COUNT(*) as count FROM anggota_dpr',
        byFraksi: 'SELECT fraksi, COUNT(*) as count FROM anggota_dpr WHERE fraksi IS NOT NULL AND fraksi != "" GROUP BY fraksi ORDER BY count DESC',
        byPartai: 'SELECT partai, COUNT(*) as count FROM anggota_dpr WHERE partai IS NOT NULL AND partai != "" GROUP BY partai ORDER BY count DESC',
        byPendidikan: 'SELECT pendidikan_terakhir, COUNT(*) as count FROM anggota_dpr WHERE pendidikan_terakhir IS NOT NULL AND pendidikan_terakhir != "" GROUP BY pendidikan_terakhir ORDER BY count DESC',
        byAgama: 'SELECT agama, COUNT(*) as count FROM anggota_dpr WHERE agama IS NOT NULL AND agama != "" GROUP BY agama ORDER BY count DESC',
        byUsia: `
          SELECT 
            CASE 
              WHEN usia < 30 THEN 'Di bawah 30'
              WHEN usia BETWEEN 30 AND 40 THEN '30-40 tahun'
              WHEN usia BETWEEN 41 AND 50 THEN '41-50 tahun'
              WHEN usia BETWEEN 51 AND 60 THEN '51-60 tahun'
              WHEN usia > 60 THEN 'Di atas 60'
              ELSE 'Tidak diketahui'
            END as kategori_usia,
            COUNT(*) as count,
            AVG(usia) as avg_usia
          FROM anggota_dpr 
          GROUP BY kategori_usia 
          ORDER BY count DESC
        `,
        byGender: `
          SELECT 
            CASE 
              WHEN LOWER(nama) LIKE 'hj.%' OR LOWER(nama) LIKE '%siti%' OR LOWER(nama) LIKE '%dewi%' OR LOWER(nama) LIKE '%sri%' THEN 'Perempuan'
              WHEN LOWER(nama) LIKE 'h.%' OR LOWER(nama) LIKE '%ahmad%' OR LOWER(nama) LIKE '%muhammad%' THEN 'Laki-laki'
              ELSE 'Tidak diketahui'
            END as gender,
            COUNT(*) as count
          FROM anggota_dpr 
          GROUP BY gender 
          ORDER BY count DESC
        `,
        avgAge: 'SELECT AVG(usia) as avg_age, MIN(usia) as min_age, MAX(usia) as max_age FROM anggota_dpr WHERE usia IS NOT NULL',
        recentMembers: 'SELECT nama, fraksi, partai FROM anggota_dpr ORDER BY id DESC LIMIT 5'
      };

      const results = {};
      let completed = 0;
      const total = Object.keys(queries).length;

      Object.entries(queries).forEach(([key, query]) => {
        this.db.all(query, (err, rows) => {
          if (err) {
            console.error(`Error in ${key} query:`, err);
            results[key] = [];
          } else {
            results[key] = rows;
          }
          
          completed++;
          if (completed === total) {
            resolve(results);
          }
        });
      });
    });
  }

  // Get unique values for filters
  async getFilterOptions() {
    return new Promise((resolve, reject) => {
      const queries = {
        fraksi: 'SELECT DISTINCT fraksi FROM anggota_dpr WHERE fraksi IS NOT NULL AND fraksi != "" ORDER BY fraksi',
        partai: 'SELECT DISTINCT partai FROM anggota_dpr WHERE partai IS NOT NULL AND partai != "" ORDER BY partai',
        agama: 'SELECT DISTINCT agama FROM anggota_dpr WHERE agama IS NOT NULL AND agama != "" ORDER BY agama',
        pendidikan: 'SELECT DISTINCT pendidikan_terakhir FROM anggota_dpr WHERE pendidikan_terakhir IS NOT NULL AND pendidikan_terakhir != "" ORDER BY pendidikan_terakhir',
        dapil: 'SELECT DISTINCT dapil FROM anggota_dpr WHERE dapil IS NOT NULL AND dapil != "" ORDER BY dapil'
      };

      const results = {};
      let completed = 0;
      const total = Object.keys(queries).length;

      Object.entries(queries).forEach(([key, query]) => {
        this.db.all(query, (err, rows) => {
          if (err) {
            console.error(`Error in ${key} query:`, err);
            results[key] = [];
          } else {
            results[key] = rows.map(row => Object.values(row)[0]);
          }
          
          completed++;
          if (completed === total) {
            resolve(results);
          }
        });
      });
    });
  }
}

const database = new DPRDatabase();

// API Routes

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    database: 'connected',
    environment: process.env.NODE_ENV || 'development'
  });
});

// Get all members with pagination
app.get('/api/members', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 25,
      sortBy = 'nama',
      sortOrder = 'ASC'
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const options = {
      limit: parseInt(limit),
      offset,
      sortBy,
      sortOrder
    };

    const members = await database.search('', options);
    const total = await database.getSearchCount('');
    const totalPages = Math.ceil(total / parseInt(limit));

    res.json({
      success: true,
      data: members,
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        totalItems: total,
        itemsPerPage: parseInt(limit),
        hasNext: parseInt(page) < totalPages,
        hasPrev: parseInt(page) > 1
      }
    });
  } catch (error) {
    console.error('Get members error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error',
      message: 'Gagal mengambil data anggota'
    });
  }
});

// Search members with advanced options
app.post('/api/search', async (req, res) => {
  try {
    const { 
      query = '',
      page = 1,
      limit = 25,
      sortBy = 'nama',
      sortOrder = 'ASC',
      filters = {}
    } = req.body;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const options = {
      limit: parseInt(limit),
      offset,
      sortBy,
      sortOrder,
      filters
    };

    const results = await database.search(query.trim(), options);
    const total = await database.getSearchCount(query.trim(), filters);
    const totalPages = Math.ceil(total / parseInt(limit));

    res.json({
      success: true,
      results,
      query: query.trim(),
      count: results.length,
      total,
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        totalItems: total,
        itemsPerPage: parseInt(limit),
        hasNext: parseInt(page) < totalPages,
        hasPrev: parseInt(page) > 1
      }
    });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error',
      message: 'Gagal melakukan pencarian'
    });
  }
});

// Get member by ID
app.get('/api/members/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const member = await database.getMemberById(id);
    
    if (!member) {
      return res.status(404).json({
        success: false,
        error: 'Member not found',
        message: 'Anggota DPR tidak ditemukan'
      });
    }

    res.json({
      success: true,
      data: member
    });
  } catch (error) {
    console.error('Get member by ID error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error',
      message: 'Gagal mengambil data anggota'
    });
  }
});

// Get statistics
app.get('/api/stats', async (req, res) => {
  try {
    const stats = await database.getStats();
    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error',
      message: 'Gagal mengambil statistik'
    });
  }
});

// Get filter options
app.get('/api/filters', async (req, res) => {
  try {
    const options = await database.getFilterOptions();
    res.json({
      success: true,
      data: options
    });
  } catch (error) {
    console.error('Filter options error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error',
      message: 'Gagal mengambil opsi filter'
    });
  }
});

// Export data as CSV
app.get('/api/export', async (req, res) => {
  try {
    const { format = 'json' } = req.query;
    const members = await database.search('', { limit: 10000 });

    if (format === 'csv') {
      const csvHeaders = [
        'ID', 'Nama', 'Fraksi', 'Partai', 'Dapil', 'TTL', 'Agama', 
        'Kota Lahir', 'Usia', 'Pendidikan Terakhir', 'Kader', 'Dewan'
      ];
      
      let csvContent = csvHeaders.join(',') + '\n';
      
      members.forEach(member => {
        const row = [
          member.id,
          `"${member.nama || ''}"`,
          `"${member.fraksi || ''}"`,
          `"${member.partai || ''}"`,
          `"${member.dapil || ''}"`,
          `"${member.ttl || ''}"`,
          `"${member.agama || ''}"`,
          `"${member.kota_lahir || ''}"`,
          member.usia || '',
          `"${member.pendidikan_terakhir || ''}"`,
          member.is_kader === '1' ? 'Ya' : 'Tidak',
          member.is_dewan === '1' ? 'Ya' : 'Tidak'
        ];
        csvContent += row.join(',') + '\n';
      });

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="dpr_data.csv"');
      res.send(csvContent);
    } else {
      res.json({
        success: true,
        data: members,
        count: members.length
      });
    }
  } catch (error) {
    console.error('Export error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Internal server error',
      message: 'Gagal mengekspor data'
    });
  }
});

// Serve static files
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ 
    success: false,
    error: 'Internal server error',
    message: 'Terjadi kesalahan pada server'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ 
    success: false,
    error: 'Not found',
    message: 'Endpoint tidak ditemukan',
    requested: req.originalUrl
  });
});

// Start server
const server = app.listen(PORT, () => {
  console.log(`🚀 DPR API Server running on port ${PORT}`);
  console.log(`📊 API Endpoints:`);
  console.log(`   GET  /api/health - Health check`);
  console.log(`   GET  /api/members - Get all members`);
  console.log(`   POST /api/search - Search members`);
  console.log(`   GET  /api/members/:id - Get member by ID`);
  console.log(`   GET  /api/stats - Get statistics`);
  console.log(`   GET  /api/filters - Get filter options`);
  console.log(`   GET  /api/export - Export data`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  server.close(() => {
    if (database.db) {
      database.db.close();
    }
    process.exit(0);
  });
});

module.exports = app;
