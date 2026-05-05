"""
ASGI entry point for Vercel deployment
"""
from app.main import app

# Vercel expects the app to be available as 'app' variable
__all__ = ['app']
