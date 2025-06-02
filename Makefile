NAME = ft_transcendence

all: build up

build:
	@docker-compose build

up:
	@docker-compose up -d

down:
	@docker-compose down

ps:
	@docker-compose ps

logs:
	@docker-compose logs

restart:
	@docker-compose restart

clean:
	@docker-compose down -v 2>/dev/null || true
	@docker volume rm ft_transcendence_database 2>/dev/null || true
	@docker rmi ft_transcendence_backend ft_transcendence_frontend 2>/dev/null || true

fclean: clean
	@echo "Complete cleanup of ft_transcendence project completed"
	@rm -rf ./backend/node_modules ./frontend/node_modules ./backend/dist ./frontend/dist 2>/dev/null || true

re: clean build up

.PHONY: all build up down ps logs restart clean fclean re