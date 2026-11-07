FROM python:3.12-slim
WORKDIR /app
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ /app
RUN useradd --create-home healthmap && chown -R healthmap:healthmap /app
USER healthmap
EXPOSE 8000
CMD ["sh", "/app/start.sh"]
