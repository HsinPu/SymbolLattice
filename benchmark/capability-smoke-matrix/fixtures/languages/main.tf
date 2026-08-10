resource "aws_instance" "web" {
  ami = "ami-smoke"
}

output "endpoint" {
  value = aws_instance.web.public_dns
}
