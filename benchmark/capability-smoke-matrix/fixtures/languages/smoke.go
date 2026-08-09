package smoke

func goHelper() int {
	return 1
}

func goEntry() int {
	return goHelper()
}
