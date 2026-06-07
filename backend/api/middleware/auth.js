import jwt from 'jsonwebtoken';

const verifyToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader) {
        return res.status(403).send({ status: "Error", message: "No token provided" });
    }

    // Check if the token is prefixed with "Bearer "
    const token = authHeader.split(' ')[1];
    if (!token) {
        return res.status(403).send({ status: "Error", message: "Invalid token format" });
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
        if (err) {
            console.log(err);
            return res.status(401).send({ status: "Error", message: "Failed to authenticate token" });
        }
        req.userId = decoded.id;
        next();
    });
};

export { verifyToken };