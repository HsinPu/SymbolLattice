from django.urls import path


def home(request):
    return None


urlpatterns = [
    path("home/", home),
]
