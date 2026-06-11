DROP DATABASE IF EXISTS `assessment`;

CREATE DATABASE `assessment`;
USE `assessment`;

CREATE TABLE users (
    id int NOT NULL AUTO_INCREMENT,
    username varchar(50) NOT NULL DEFAULT 'none',
    password varchar(255) NOT NULL,
    role enum('admin', 'user') NOT NULL DEFAULT 'user',
    token_version int NOT NULL DEFAULT 0,
    PRIMARY KEY (id)
);

CREATE TABLE scenarios (
    id int NOT NULL AUTO_INCREMENT,
    user_id int NOT NULL,
    name varchar(255) NOT NULL,
    broadcast_reward float NOT NULL,
    destroyed_reward float NOT NULL,
    conquer_reward float NOT NULL,
    colonize_reward float NOT NULL,
    survive_reward float NOT NULL,
    population_reward float NOT NULL,
    science_reward float NOT NULL,
    explore_reward float NOT NULL,
    invalid_reward float NOT NULL,
    civilizations int NOT NULL,
    map_width int NOT NULL,
    map_height int NOT NULL,
    planets int NOT NULL,
    harvest_rate float NOT NULL,
    initial_resources int NOT NULL,
    initial_population int NOT NULL,
    max_steps int NOT NULL,
    critic enum('IPPO', 'MAPPO') NOT NULL,
    PRIMARY KEY (id),
    FOREIGN KEY (user_id) REFERENCES users(id)
)