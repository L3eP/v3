const isAuthenticated = (req, res, next) => {
    if (req.session && req.session.user) {
        return next();
    }
    res.status(401).json({ message: 'Unauthorized: Please log in' });
};

const isAdmin = (req, res, next) => {
    if (req.session && req.session.user && req.session.user.role === 'Owner') {
        return next();
    }
    res.status(403).json({ message: 'Forbidden: Owner access required' });
};

const isOwnerOrOperator = (req, res, next) => {
    const role = req.session?.user?.role;
    if (role === 'Owner' || role === 'Operator') {
        return next();
    }
    res.status(403).json({ message: 'Forbidden: Owner or Operator access required' });
};

module.exports = { isAuthenticated, isAdmin, isOwnerOrOperator };
