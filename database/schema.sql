CREATE DATABASE `assessment`;
USE `assessment`;

CREATE TABLE users (
    id int NOT NULL AUTO_INCREMENT,
    username varchar(50) NOT NULL DEFAULT 'none',
    password varchar(255) NOT NULL,
    role enum('admin', 'user') NOT NULL DEFAULT 'user',
    PRIMARY KEY (id)
);

CREATE TABLE scenarios (
    id int NOT NULL AUTO_INCREMENT,
    user_id int NOT NULL,
    name varchar(255) NOT NULL,
    PRIMARY KEY (id),
    FOREIGN KEY (user_id) REFERENCES users(id)
)