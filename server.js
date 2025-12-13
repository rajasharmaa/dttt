// ==================== CONFIGURATION ====================
// Only load dotenv in development, Render provides env vars in production
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}

const express = require('express');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcrypt');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const { connectToDB } = require('./database');
const { ObjectId } = require('mongodb');

const app = express();

// ==================== CORS CONFIGURATION ====================
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://127.0.0.1:5500',
  process.env.RENDER_EXTERNAL_URL, // Your Render app URL
  'https://your-app-name.onrender.com' // Replace with your actual Render URL
].filter(Boolean);

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.log('Blocked by CORS:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  exposedHeaders: ['Content-Range', 'X-Content-Range']
}));

// ==================== MIDDLEWARE ====================
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Session configuration for production
app.use(session({
  secret: process.env.SESSION_SECRET || 'fallback-secret-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge: 24 * 60 * 60 * 1000
  },
  store: process.env.NODE_ENV === 'production' ? 
    (() => {
      // For production, you might want to use a session store like MongoDB
      // Currently using memory store (not recommended for production scaling)
      console.log('⚠️  Using memory store for sessions - consider MongoDB store for production');
      return null;
    })() : null
}));

// ==================== STATIC FILES ====================
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: process.env.NODE_ENV === 'production' ? '1d' : '0'
}));

// For Single Page Applications (SPA) - serve index.html for all routes
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) {
    return next();
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ==================== AUTHENTICATION MIDDLEWARE ====================
function requireUserAuth(req, res, next) {
  if (!req.session.user) {
    if (req.headers.accept && req.headers.accept.includes('application/json')) {
      return res.status(401).json({ 
        error: 'Unauthorized',
        message: 'Please login to access this resource'
      });
    }
    return res.status(401).json({ error: 'Please login first' });
  }
  next();
}

function requireAdminAuth(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'admin') {
    return res.status(403).json({ 
      error: 'Forbidden',
      message: 'Admin privileges required'
    });
  }
  next();
}

// ==================== HEALTH & STATUS ENDPOINTS ====================
app.get('/api/health', async (req, res) => {
  try {
    const db = await connectToDB();
    await db.command({ ping: 1 });
    
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: 'Damodar Traders API',
      environment: process.env.NODE_ENV || 'development',
      database: 'connected',
      uptime: process.uptime(),
      memory: process.memoryUsage()
    });
  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: 'Database connection failed',
      details: error.message
    });
  }
});

app.get('/api/info', (req, res) => {
  res.json({
    name: 'Damodar Traders API',
    version: '1.0.0',
    description: 'E-commerce and inquiry management system',
    environment: process.env.NODE_ENV || 'development',
    node_version: process.version
  });
});

// ==================== USER AUTHENTICATION ROUTES ====================
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password, phone } = req.body;
    
    // Validation
    if (!name || !email || !password) {
      return res.status(400).json({ 
        error: 'Validation Error',
        message: 'Name, email and password are required'
      });
    }
    
    if (password.length < 6) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Password must be at least 6 characters'
      });
    }
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Invalid email format'
      });
    }
    
    const db = await connectToDB();
    const usersCollection = db.collection('users');
    
    // Check if user exists
    const existingUser = await usersCollection.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(409).json({ 
        error: 'Conflict',
        message: 'User with this email already exists'
      });
    }
    
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);
    
    // Create user
    const newUser = {
      name,
      email: email.toLowerCase(),
      phone: phone || '',
      password: hashedPassword,
      role: 'user',
      emailVerified: false,
      active: true,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    const result = await usersCollection.insertOne(newUser);
    
    // Create session (exclude password)
    req.session.user = {
      id: result.insertedId,
      email: newUser.email,
      name: newUser.name,
      role: newUser.role
    };
    
    // Return user without password
    const userResponse = {
      id: result.insertedId,
      name: newUser.name,
      email: newUser.email,
      phone: newUser.phone,
      role: newUser.role,
      createdAt: newUser.createdAt
    };
    
    res.status(201).json({
      success: true,
      message: 'Registration successful',
      user: userResponse
    });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ 
      error: 'Internal Server Error',
      message: 'Registration failed. Please try again later.'
    });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ 
        error: 'Validation Error',
        message: 'Email and password are required'
      });
    }
    
    const db = await connectToDB();
    const usersCollection = db.collection('users');
    
    // Find user (case-insensitive email)
    const user = await usersCollection.findOne({ 
      email: email.toLowerCase(),
      active: true 
    });
    
    if (!user) {
      return res.status(401).json({ 
        error: 'Authentication Error',
        message: 'Invalid credentials'
      });
    }
    
    // Verify password
    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      return res.status(401).json({ 
        error: 'Authentication Error',
        message: 'Invalid credentials'
      });
    }
    
    // Create session
    req.session.user = {
      id: user._id,
      email: user.email,
      name: user.name,
      role: user.role
    };
    
    // Return user without password
    const userResponse = {
      id: user._id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      createdAt: user.createdAt
    };
    
    res.json({
      success: true,
      message: 'Login successful',
      user: userResponse
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ 
      error: 'Internal Server Error',
      message: 'Login failed. Please try again later.'
    });
  }
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Logout error:', err);
      return res.status(500).json({ 
        error: 'Internal Server Error',
        message: 'Logout failed'
      });
    }
    
    res.clearCookie('connect.sid');
    res.json({ 
      success: true,
      message: 'Logout successful' 
    });
  });
});

app.get('/api/auth/status', (req, res) => {
  if (req.session.user) {
    res.json({
      authenticated: true,
      user: {
        id: req.session.user.id,
        name: req.session.user.name,
        email: req.session.user.email,
        role: req.session.user.role
      }
    });
  } else {
    res.json({ 
      authenticated: false 
    });
  }
});

// ==================== PRODUCT ROUTES ====================
app.get('/api/products', async (req, res) => {
  try {
    const { category, search, limit = 50, page = 1 } = req.query;
    const db = await connectToDB();
    const productsCollection = db.collection('products');
    
    // Build query
    const query = {};
    
    if (category) {
      query.category = category;
    }
    
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }
    
    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Get products and total count
    const [products, total] = await Promise.all([
      productsCollection.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .toArray(),
      productsCollection.countDocuments(query)
    ]);
    
    res.json({
      success: true,
      data: products,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (err) {
    console.error('Error fetching products:', err);
    res.status(500).json({ 
      error: 'Internal Server Error',
      message: 'Failed to fetch products'
    });
  }
});

app.get('/api/products/category/:category', async (req, res) => {
  try {
    const { limit = 20 } = req.query;
    const db = await connectToDB();
    const productsCollection = db.collection('products');
    
    const products = await productsCollection.find({ 
      category: req.params.category,
      active: true 
    })
    .sort({ createdAt: -1 })
    .limit(parseInt(limit))
    .toArray();
    
    res.json({
      success: true,
      data: products,
      category: req.params.category,
      count: products.length
    });
  } catch (err) {
    console.error('Error fetching products by category:', err);
    res.status(500).json({ 
      error: 'Internal Server Error',
      message: 'Failed to fetch products'
    });
  }
});

app.get('/api/products/:id', async (req, res) => {
  try {
    if (!ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ 
        error: 'Validation Error',
        message: 'Invalid product ID format'
      });
    }
    
    const db = await connectToDB();
    const productsCollection = db.collection('products');
    
    const product = await productsCollection.findOne({ 
      _id: new ObjectId(req.params.id),
      active: true 
    });
    
    if (!product) {
      return res.status(404).json({ 
        error: 'Not Found',
        message: 'Product not found'
      });
    }
    
    res.json({
      success: true,
      data: product
    });
  } catch (err) {
    console.error('Error fetching product:', err);
    res.status(500).json({ 
      error: 'Internal Server Error',
      message: 'Failed to fetch product'
    });
  }
});

// ==================== INQUIRY ROUTES ====================
app.post('/api/inquiries', async (req, res) => {
  try {
    const { name, email, phone, subject, message, userId } = req.body;
    
    // Validation
    if (!name || !email || !subject || !message) {
      return res.status(400).json({ 
        error: 'Validation Error',
        message: 'Name, email, subject and message are required'
      });
    }
    
    const db = await connectToDB();
    const inquiriesCollection = db.collection('inquiries');
    
    const newInquiry = {
      name,
      email,
      phone: phone || '',
      subject,
      message,
      status: 'new',
      read: false,
      userId: userId || (req.session.user ? req.session.user.id : null),
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    const result = await inquiriesCollection.insertOne(newInquiry);
    
    res.status(201).json({
      success: true,
      message: 'Inquiry submitted successfully',
      data: {
        ...newInquiry,
        _id: result.insertedId
      }
    });
  } catch (err) {
    console.error('Error creating inquiry:', err);
    res.status(500).json({ 
      error: 'Internal Server Error',
      message: 'Failed to submit inquiry'
    });
  }
});

app.get('/api/user/inquiries', requireUserAuth, async (req, res) => {
  try {
    const db = await connectToDB();
    const inquiriesCollection = db.collection('inquiries');
    
    const inquiries = await inquiriesCollection.find({ 
      userId: req.session.user.id 
    })
    .sort({ createdAt: -1 })
    .toArray();
    
    res.json({
      success: true,
      data: inquiries,
      count: inquiries.length
    });
  } catch (err) {
    console.error('Error fetching user inquiries:', err);
    res.status(500).json({ 
      error: 'Internal Server Error',
      message: 'Failed to fetch inquiries'
    });
  }
});

// ==================== USER PROFILE ROUTES ====================
app.get('/api/users/:id', requireUserAuth, async (req, res) => {
  try {
    if (!ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ 
        error: 'Validation Error',
        message: 'Invalid user ID format'
      });
    }
    
    const db = await connectToDB();
    const usersCollection = db.collection('users');
    
    const user = await usersCollection.findOne({ 
      _id: new ObjectId(req.params.id),
      active: true 
    }, { 
      projection: { password: 0 } 
    });
    
    if (!user) {
      return res.status(404).json({ 
        error: 'Not Found',
        message: 'User not found'
      });
    }
    
    // Authorization check
    const isAdmin = req.session.user.role === 'admin';
    const isOwnProfile = req.session.user.id.toString() === req.params.id;
    
    if (!isAdmin && !isOwnProfile) {
      return res.status(403).json({ 
        error: 'Forbidden',
        message: 'You do not have permission to access this resource'
      });
    }
    
    res.json({
      success: true,
      data: user
    });
  } catch (err) {
    console.error('Error fetching user:', err);
    res.status(500).json({ 
      error: 'Internal Server Error',
      message: 'Failed to fetch user'
    });
  }
});

app.put('/api/users/:id', requireUserAuth, async (req, res) => {
  try {
    if (!ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ 
        error: 'Validation Error',
        message: 'Invalid user ID format'
      });
    }
    
    // Authorization check
    const isAdmin = req.session.user.role === 'admin';
    const isOwnProfile = req.session.user.id.toString() === req.params.id;
    
    if (!isAdmin && !isOwnProfile) {
      return res.status(403).json({ 
        error: 'Forbidden',
        message: 'You can only update your own profile'
      });
    }
    
    const { name, phone, currentPassword, newPassword } = req.body;
    const updateData = {
      updatedAt: new Date()
    };
    
    if (name) updateData.name = name;
    if (phone !== undefined) updateData.phone = phone;
    
    // Password update logic
    if (newPassword) {
      if (!currentPassword && !isAdmin) {
        return res.status(400).json({ 
          error: 'Validation Error',
          message: 'Current password is required to set a new password'
        });
      }
      
      const db = await connectToDB();
      const usersCollection = db.collection('users');
      
      if (!isAdmin) {
        const user = await usersCollection.findOne({ 
          _id: new ObjectId(req.params.id) 
        });
        
        if (!user) {
          return res.status(404).json({ 
            error: 'Not Found',
            message: 'User not found'
          });
        }
        
        const passwordMatch = await bcrypt.compare(currentPassword, user.password);
        if (!passwordMatch) {
          return res.status(401).json({ 
            error: 'Authentication Error',
            message: 'Current password is incorrect'
          });
        }
      }
      
      updateData.password = await bcrypt.hash(newPassword, 12);
    }
    
    const db = await connectToDB();
    const usersCollection = db.collection('users');
    
    const result = await usersCollection.updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: updateData }
    );
    
    if (result.matchedCount === 0) {
      return res.status(404).json({ 
        error: 'Not Found',
        message: 'User not found'
      });
    }
    
    // Update session if name changed
    if (name && req.session.user && isOwnProfile) {
      req.session.user.name = name;
    }
    
    const updatedUser = await usersCollection.findOne({ 
      _id: new ObjectId(req.params.id) 
    }, { 
      projection: { password: 0 } 
    });
    
    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: updatedUser
    });
  } catch (err) {
    console.error('Error updating user:', err);
    res.status(500).json({ 
      error: 'Internal Server Error',
      message: 'Failed to update user'
    });
  }
});

// ==================== ADMIN ROUTES ====================
app.get('/api/admin/inquiries', requireAdminAuth, async (req, res) => {
  try {
    const { status, limit = 50, page = 1 } = req.query;
    const db = await connectToDB();
    const inquiriesCollection = db.collection('inquiries');
    
    const query = {};
    if (status) query.status = status;
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const [inquiries, total] = await Promise.all([
      inquiriesCollection.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .toArray(),
      inquiriesCollection.countDocuments(query)
    ]);
    
    res.json({
      success: true,
      data: inquiries,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (err) {
    console.error('Error fetching admin inquiries:', err);
    res.status(500).json({ 
      error: 'Internal Server Error',
      message: 'Failed to fetch inquiries'
    });
  }
});

app.put('/api/admin/inquiries/:id', requireAdminAuth, async (req, res) => {
  try {
    const { status, read } = req.body;
    
    if (!ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ 
        error: 'Validation Error',
        message: 'Invalid inquiry ID format'
      });
    }
    
    const db = await connectToDB();
    const inquiriesCollection = db.collection('inquiries');
    
    const updateData = { updatedAt: new Date() };
    if (status) updateData.status = status;
    if (read !== undefined) updateData.read = read;
    
    const result = await inquiriesCollection.updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: updateData }
    );
    
    if (result.matchedCount === 0) {
      return res.status(404).json({ 
        error: 'Not Found',
        message: 'Inquiry not found'
      });
    }
    
    const updatedInquiry = await inquiriesCollection.findOne({ 
      _id: new ObjectId(req.params.id) 
    });
    
    res.json({
      success: true,
      message: 'Inquiry updated successfully',
      data: updatedInquiry
    });
  } catch (err) {
    console.error('Error updating inquiry:', err);
    res.status(500).json({ 
      error: 'Internal Server Error',
      message: 'Failed to update inquiry'
    });
  }
});

// ==================== ERROR HANDLING ====================
app.use((req, res, next) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Cannot ${req.method} ${req.url}`
  });
});

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  
  // Handle CORS errors
  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Cross-origin request not allowed'
    });
  }
  
  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'production' 
      ? 'Something went wrong' 
      : err.message,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
  });
});

// ==================== SERVER STARTUP ====================
const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    // Test database connection on startup
    const db = await connectToDB();
    await db.command({ ping: 1 });
    console.log('✅ Database connection established');
    
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`📅 Started at: ${new Date().toISOString()}`);
      console.log(`🔗 Health check: http://localhost:${PORT}/api/health`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

// ==================== GRACEFUL SHUTDOWN ====================
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received. Starting graceful shutdown...');
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('\n🛑 SIGINT received. Shutting down gracefully...');
  process.exit(0);
});
